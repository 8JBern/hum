import './ui/style.css';
import { Game } from './game.ts';

const app = document.getElementById('app')!;
const game = new Game(app);
const test = new URLSearchParams(location.search).has('test');
window.addEventListener('error', (e) => game.errors.push(String(e.message)));
window.addEventListener('unhandledrejection', (e) => game.errors.push(String(e.reason)));
if (test) game.installHooks();
