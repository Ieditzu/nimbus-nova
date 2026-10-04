import { StrictMode } from 'react';
import { hydrateRoot, createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './styles.css';
import './legal.css';
import './not-found.css';
import App from './App';

export { api } from './api/instance';

const root = document.getElementById('root')!;
const app = <StrictMode><BrowserRouter><App /></BrowserRouter></StrictMode>;
if (root.dataset.prerendered === 'true' && window.location.pathname === '/') hydrateRoot(root, app);
else createRoot(root).render(app);
