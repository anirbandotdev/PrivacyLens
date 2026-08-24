import React from 'react';
import ReactDOM from 'react-dom/client';
import DashboardApp from './DashboardApp.jsx';
import '../styles/index.css';
import './dashboard.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <DashboardApp />
  </React.StrictMode>
);
