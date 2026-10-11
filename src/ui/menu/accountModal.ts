// The ACCOUNT window (website and Windows app): sign in with an email and a password
// (nothing is ever emailed), make an account, change the password,
// see whether the save is up to date, and choose between two saves when this
// device and the account have both moved on. Opens by itself for that choice.

import { el, clearEl, button } from '../dom';
import { changePassword, cloudEnabled, cloudState, createAccount, onCloud, PASSWORD_MIN, resolveConflict, signIn, signOut, syncNow, type CloudState } from '../../net/cloud';
import type { SaveSummary } from '../../net/cloudSave';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class AccountModal {
  private root: HTMLElement;
  private body: HTMLElement;
  private open = false;
  private mode: 'signin' | 'create' = 'signin';
  private email = '';
  private changing = false;
  /** what is typed in the password boxes, kept across redraws (an error message redraws the window) */
  private pw = ['', ''];
  private notice = '';
  private working = false;
  private error = '';

  constructor() {
    this.root = el('div', 'modal-back hidden', document.body);
    const m = el('div', 'modal acct', this.root);
    const head = el('div', 'modal-head', m);
    el('h2', '', head, 'ACCOUNT');
    button('CLOSE', 'small', head, () => this.show(false));
    this.body = el('div', 'modal-body', m);
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) this.show(false);
    });
    onCloud((s) => {
      if (s.status === 'conflict' && !this.open) this.show(true);
      else if (this.open) this.render(s);
    });
  }

  show(on: boolean): void {
    // the choice between two saves cannot be dismissed: sync waits for it
    if (!on && cloudState().status === 'conflict') return;
    this.open = on;
    this.root.classList.toggle('hidden', !on);
    if (!on) this.pw = ['', ''];
    if (on) {
      this.error = '';
      this.notice = '';
      this.changing = false;
      this.render(cloudState());
    }
  }

  private async run(fn: () => Promise<void>): Promise<void> {
    if (this.working) return;
    this.working = true;
    this.error = '';
    this.notice = '';
    this.render(cloudState());
    try {
      await fn();
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.working = false;
      this.render(cloudState());
    }
  }

  private render(s: CloudState): void {
    const b = this.body;
    clearEl(b);
    if (s.status === 'off') {
      el('p', 'acct-p', b, 'Accounts are not available in this version of the game.');
      return;
    }
    if (s.status === 'conflict' && s.conflict) {
      this.conflict(b, s);
    } else if (s.status === 'signed-out') {
      this.signIn(b);
    } else {
      this.signedIn(b, s);
    }
    if (this.notice) el('p', 'acct-p acct-ok', b, this.notice);
    if (this.error) el('p', 'acct-err', b, this.error);
  }

  private signIn(b: HTMLElement): void {
    const create = this.mode === 'create';
    // two plain tabs: SIGN IN (have an account) / NEW ACCOUNT
    const tabs = el('div', 'acct-tabs', b);
    const tab = (label: string, m: 'signin' | 'create'): void => {
      const t = button(label, 'acct-tab' + (this.mode === m ? ' on' : ''), tabs, () => {
        if (this.mode === m) return;
        this.mode = m;
        this.pw = ['', ''];
        this.error = '';
        this.render(cloudState());
      });
      t.disabled = this.working;
    };
    tab('SIGN IN', 'signin');
    tab('NEW ACCOUNT', 'create');
    el('p', 'acct-p', b, create ? 'Make an account to save your progress online.' : 'Sign in to save your progress online and play on any device.');
    const form = el('div', 'acct-form', b);
    const field = (label: string, type: string, ac: AutoFill, v = ''): HTMLInputElement => {
      const l = el('label', 'acct-label', form, label);
      const i = el('input', 'mp-input acct-in', l);
      i.type = type;
      i.autocomplete = ac;
      i.value = v;
      i.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') go();
      });
      return i;
    };
    const email = field('Email', 'email', 'username', this.email);
    const pass = field(create ? `Password (at least ${PASSWORD_MIN} characters)` : 'Password', 'password', create ? 'new-password' : 'current-password', this.pw[0]);
    const again = create ? field('Type the password again', 'password', 'new-password', this.pw[1]) : null;
    pass.addEventListener('input', () => (this.pw[0] = pass.value));
    again?.addEventListener('input', () => (this.pw[1] = again.value));
    const go = (): void => {
      const v = email.value.trim();
      this.email = v;
      const bad = !EMAIL.test(v)
        ? 'Type your email address.'
        : pass.value.length < (create ? PASSWORD_MIN : 1)
          ? create ? `The password needs at least ${PASSWORD_MIN} characters.` : 'Type your password.'
          : again && again.value !== pass.value
            ? 'The two passwords are not the same.'
            : '';
      if (bad) {
        this.error = bad;
        this.render(cloudState());
        return;
      }
      const pw = pass.value;
      void this.run(async () => {
        await (create ? createAccount(v, pw) : signIn(v, pw));
        this.pw = ['', ''];
      });
    };
    const ok = button(this.working ? 'ONE MOMENT…' : create ? 'CREATE ACCOUNT' : 'SIGN IN', 'primary acct-go', b, go);
    ok.disabled = this.working;
    if (create) el('p', 'acct-p acct-dim', b, 'No email is sent. Write your password down: it cannot be reset.');
    if (!this.working) setTimeout(() => (this.email ? pass : email).focus(), 0);
  }

  private signedIn(b: HTMLElement, s: CloudState): void {
    const who = el('div', 'acct-who', b);
    el('div', 'acct-who-t', who, 'SIGNED IN');
    el('div', 'acct-who-e', who, s.email ?? 'your account');
    if (s.status === 'synced' || s.status === 'syncing') el('p', 'acct-p acct-ok', b, '✓ Your progress saves by itself.');
    else {
      el('p', 'acct-err', b, s.status === 'offline' ? 'You are offline. Your progress is safe here and saves when you are back online.' : 'Could not save just now. Your progress is safe here.');
      const retry = button('TRY AGAIN', '', el('div', 'acct-row', b), () => void this.run(syncNow));
      retry.disabled = this.working;
    }
    if (!this.changing) {
      const so = button('SIGN OUT', 'acct-go', b, () => void this.run(signOut));
      so.disabled = this.working;
      button('Change password', 'acct-link', b, () => {
        this.changing = true;
        this.error = '';
        this.render(cloudState());
      });
      return;
    }
    el('p', 'acct-p', b, 'Choose a new password.');
    const form = el('div', 'acct-form', b);
    const field = (label: string): HTMLInputElement => {
      const l = el('label', 'acct-label', form, label);
      const i = el('input', 'mp-input acct-in', l);
      i.type = 'password';
      i.autocomplete = 'new-password';
      i.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') go();
      });
      return i;
    };
    const pass = field(`New password (at least ${PASSWORD_MIN} characters)`);
    const again = field('Type it again');
    const go = (): void => {
      const bad = pass.value.length < PASSWORD_MIN ? `The password needs at least ${PASSWORD_MIN} characters.` : again.value !== pass.value ? 'The two passwords are not the same.' : '';
      if (bad) {
        this.error = bad;
        this.render(cloudState());
        return;
      }
      const pw = pass.value;
      void this.run(async () => {
        await changePassword(pw);
        this.changing = false;
        this.notice = '✓ Password changed.';
      });
    };
    const savePw = button(this.working ? 'ONE MOMENT…' : 'SAVE PASSWORD', 'primary acct-go', b, go);
    savePw.disabled = this.working;
    button('Cancel', 'acct-link', b, () => {
      this.changing = false;
      this.error = '';
      this.render(cloudState());
    });
    if (!this.working) setTimeout(() => pass.focus(), 0);
  }

  private conflict(b: HTMLElement, s: CloudState): void {
    const c = s.conflict!;
    el('h3', 'acct-h', b, 'WHICH SAVE DO YOU WANT?');
    el('p', 'acct-p', b, 'This device and your account have different progress. Pick one. The other is kept as a backup, so nothing is lost.');
    const cards = el('div', 'acct-cards', b);
    const card = (title: string, sub: string, x: SaveSummary, keep: 'device' | 'account', label: string): void => {
      const k = el('div', 'acct-card', cards);
      el('div', 'acct-card-t', k, title);
      el('div', 'acct-dim', k, sub);
      const ul = el('ul', 'acct-list', k);
      el('li', '', ul, `${x.flights} flight${x.flights === 1 ? '' : 's'} in the logbook`);
      el('li', '', ul, `${x.rankedMatches} ranked match${x.rankedMatches === 1 ? '' : 'es'}${x.rp !== null ? ` · ${x.rp.toLocaleString()} RP` : ''}`);
      el('li', '', ul, `${x.items} saved item${x.items === 1 ? '' : 's'}`);
      const btn = button(label, 'primary', k, () => void this.run(() => resolveConflict(keep)));
      btn.disabled = this.working;
    };
    card('THIS DEVICE', 'Saved in this browser', c.device, 'device', 'USE THIS ONE');
    const when = new Date(c.account.savedAt);
    card('YOUR ACCOUNT', `Saved online${isNaN(when.getTime()) ? '' : ' ' + when.toLocaleString()}`, c.account, 'account', 'USE THIS ONE');
    if (s.message) el('p', 'acct-err', b, s.message);
  }
}

let modal: AccountModal | null = null;

/** Open the ACCOUNT window. */
export function openAccount(): void {
  modal ??= new AccountModal();
  modal.show(true);
}

/** Create the window early so it can open by itself when two saves need a choice. */
export function initAccount(): void {
  if (cloudEnabled()) modal ??= new AccountModal();
}

/** The menu button's label for the current state ('' : no accounts in this build). */
export function accountLabel(s: CloudState): string {
  if (s.status === 'off') return '';
  if (s.status === 'signed-out') return 'SIGN IN';
  if (s.status === 'conflict') return 'ACCOUNT !';
  if (s.status === 'error' || s.status === 'offline') return 'ACCOUNT ⚠';
  return 'ACCOUNT ✓';
}
