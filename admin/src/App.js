// admin/src/App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import axios from 'axios';

// Admin components
import AdminDashboard from './components/admin/AdminDashboard';
import AdminLogin from './components/admin/AdminLogin';
import AdminHome from './components/admin/AdminHome';
import DataLogs from './components/admin/DataLogs';
import ReportLogs from './components/admin/ReportLogs';
import Subscribers from './components/admin/Subscribers';
import BoundariesUpload from './components/admin/BoundariesUpload';

// Helper for protected routes
const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem('adminToken');
  
  if (!token) {
    return <Navigate to="/admin/login" replace />;
  }
  
  return children;
};

// Set axios defaults
axios.defaults.baseURL = process.env.REACT_APP_API_URL || '';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/admin/login" element={<AdminLogin />} />
        
        <Route path="/admin" element={
          <ProtectedRoute>
            <AdminDashboard />
          </ProtectedRoute>
        }>
          <Route index element={<AdminHome />} />
          <Route path="data-logs" element={<DataLogs />} />
          <Route path="report-logs" element={<ReportLogs />} />
          <Route path="subscribers" element={<Subscribers />} />
          <Route path="boundaries" element={<BoundariesUpload />} />
        </Route>
        
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </Router>
  );
}

export default App;