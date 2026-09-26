import './styles.css';
import { runWorldTest } from './testWorld';

const app = document.getElementById('app')!;
const q = new URLSearchParams(location.search);
if (q.get('test') === 'world') {
  runWorldTest(app);
}
