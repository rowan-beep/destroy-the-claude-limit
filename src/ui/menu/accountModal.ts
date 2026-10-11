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
    el('p', 'acct-p', b, 'Sign in to keep your progress safe online, carry it to other devices and put your rank on the leaderboard.');
    el('p', 'acct-p acct-dim', b, create
      ? 'Your email is just the name your account goes by: nothing is sent to it. There is no password reset, so keep your password somewhere safe. Everything saved on this device is copied to the new account, and it stays on this device too.'
      : 'Use the email and password you made your account with. Everything saved on this device stays here too.');
    const form = el('div', 'acct-form', b);
    const field = (type: string, ph: string, ac: AutoFill, v = ''): HTMLInputElement => {
      const i = el('input', 'mp-input acct-in', form);
      i.type = type;
      i.placeholder = ph;
      i.autocomplete = ac;
      i.value = v;
      i.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') go();
      });
      return i;
    };
    const email = field('email', 'Email', 'username', this.email);
    const pass = field('password', create ? `Password (${PASSWORD_MIN}+ characters)` : 'Password', create ? 'new-password' : 'current-password');
    const again = create ? field('password', 'Password again', 'new-password') : null;
    const go = (): void => {
      const v = email.value.trim();
      this.email = v;
      const bad = !EMAIL.test(v)
        ? 'Enter your email address.'
        : pass.value.length < (create ? PASSWORD_MIN : 1)
          ? create ? `Choose a password of at least ${PASSWORD_MIN} characters.` : 'Enter your password.'
          : again && again.value !== pass.value
            ? 'The two passwords are different.'
            : '';
      if (bad) {
        this.error = bad;
        this.render(cloudState());
        return;
      }
      const pw = pass.value;
      void this.run(() => (create ? createAccount(v, pw) : signIn(v, pw)));
    };
    const row = el('div', 'acct-row', b);
    const ok = button(this.working ? (create ? 'CREATING…' : 'SIGNING IN…') : create ? 'CREATE ACCOUNT' : 'SIGN IN', 'primary', row, go);
    ok.disabled = this.working;
    button(create ? 'I HAVE AN ACCOUNT' : 'CREATE AN ACCOUNT', 'small', row, () => {
      this.mode = create ? 'signin' : 'create';
      this.error = '';
      this.render(cloudState());
    });
    if (!this.working) setTimeout(() => (this.email ? pass : email).focus(), 0);
  }

  private signedIn(b: HTMLElement, s: CloudState): void {
    el('p', 'acct-p', b, `Signed in as ${s.email ?? 'your account'}.`);
    if (s.status === 'syncing') el('p', 'acct-p acct-dim', b, 'Saving your progress…');
    else if (s.status === 'synced')
      el('p', 'acct-p acct-ok', b, `✓ Your progress is saved to your account${s.lastSync ? ` (last saved ${new Date(s.lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})` : ''}. Changes are saved automatically.`);
    else el('p', 'acct-err', b, `${s.status === 'offline' ? 'You are offline.' : s.message || 'Saving failed.'} Your progress is safe on this device and will be saved when the connection is back.`);
    const row = el('div', 'acct-row', b);
    const save = button(s.status === 'synced' ? 'SAVE NOW' : 'TRY AGAIN', '', row, () => void this.run(syncNow));
    save.disabled = this.working || s.status === 'syncing';
    button('SIGN OUT', '', row, () => void this.run(signOut));
    el('p', 'acct-p acct-dim', b, 'Signing out keeps everything on this device.');
    if (!this.changing) {
      button('CHANGE PASSWORD', 'small', el('div', 'acct-row', b), () => {
        this.changing = true;
        this.error = '';
        this.render(cloudState());
      });
      return;
    }
    const form = el('div', 'acct-form', b);
    const pass = el('input', 'mp-input acct-in', form);
    pass.type = 'password';
    pass.placeholder = `New password (${PASSWORD_MIN}+ characters)`;
    pass.autocomplete = 'new-password';
    const again = el('input', 'mp-input acct-in', form);
    again.type = 'password';
    again.placeholder = 'New password again';
    again.autocomplete = 'new-password';
    const go = (): void => {
      const bad = pass.value.length < PASSWORD_MIN ? `Choose a password of at least ${PASSWORD_MIN} characters.` : again.value !== pass.value ? 'The two passwords are different.' : '';
      if (bad) {
        this.error = bad;
        this.render(cloudState());
        return;
      }
      const pw = pass.value;
      void this.run(async () => {
        await changePassword(pw);
        this.changing = false;
        this.notice = 'Password changed.';
      });
    };
    for (const i of [pass, again])
      i.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') go();
      });
    const prow = el('div', 'acct-row', b);
    const savePw = button(this.working ? 'SAVING…' : 'SAVE PASSWORD', 'primary', prow, go);
    savePw.disabled = this.working;
    button('CANCEL', 'small', prow, () => {
      this.changing = false;
      this.error = '';
      this.render(cloudState());
    });
    if (!this.working) setTimeout(() => pass.focus(), 0);
  }

  private conflict(b: HTMLElement, s: CloudState): void {
    const c = s.conflict!;
    el('h3', 'acct-h', b, 'TWO DIFFERENT SAVES');
    el('p', 'acct-p', b, 'This device and your account both have progress the other one does not. Choose which to keep. The other one is stored as a backup in your account, so nothing is deleted.');
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
    card('THIS DEVICE', 'What this browser has saved now', c.device, 'device', 'KEEP THIS DEVICE’S');
    const when = new Date(c.account.savedAt);
    card('YOUR ACCOUNT', `Saved ${isNaN(when.getTime()) ? '' : when.toLocaleString()}${c.account.on ? ` from the ${c.account.on.toLowerCase()}` : ''}`, c.account, 'account', 'USE MY ACCOUNT’S');
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
