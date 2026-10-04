import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import App from './App';

export function render() { return renderToString(<StaticRouter location="/"><App /></StaticRouter>); }
export const siteUrl = import.meta.env.VITE_SITE_URL || '';
