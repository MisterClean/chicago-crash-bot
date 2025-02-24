// src/components/admin/AdminDashboard.jsx
import React, { useState, useEffect } from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';

const AdminDashboard = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('adminToken');
    
    if (!token) {
      navigate('/admin/login');
      return;
    }
    
    // Set user from stored data
    const userData = JSON.parse(localStorage.getItem('adminUser'));
    if (userData) {
      setUser(userData);
    }
    
    // Set default auth header for all requests
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    
    // Verify token is still valid
    axios.get('/api/admin/subscription-stats')
      .then(() => {
        setLoading(false);
      })
      .catch(err => {
        console.error('Auth error:', err);
        localStorage.removeItem('adminToken');
        localStorage.removeItem('adminUser');
        navigate('/admin/login');
      });
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUser');
    navigate('/admin/login');
  };

  if (loading && !user) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div className="w-64 bg-gray-800 text-white p-4">
        <div className="text-xl font-bold mb-8 pt-4">Chicago Safety Admin</div>
        
        <nav className="space-y-2">
          <Link 
            to="/admin" 
            className="block py-2.5 px-4 rounded transition duration-200 hover:bg-gray-700"
          >
            Dashboard
          </Link>
          <Link 
            to="/admin/data-logs" 
            className="block py-2.5 px-4 rounded transition duration-200 hover:bg-gray-700"
          >
            Data Import Logs
          </Link>
          <Link 
            to="/admin/report-logs" 
            className="block py-2.5 px-4 rounded transition duration-200 hover:bg-gray-700"
          >
            Report Logs
          </Link>
          <Link 
            to="/admin/subscribers" 
            className="block py-2.5 px-4 rounded transition duration-200 hover:bg-gray-700"
          >
            Subscribers
          </Link>
          <Link 
            to="/admin/boundaries" 
            className="block py-2.5 px-4 rounded transition duration-200 hover:bg-gray-700"
          >
            Geographic Boundaries
          </Link>
        </nav>
        
        <div className="absolute bottom-0 left-0 w-64 bg-gray-900 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">{user?.name}</div>
              <div className="text-xs text-gray-400">{user?.email}</div>
            </div>
            <button
              onClick={handleLogout}
              className="text-sm text-gray-400 hover:text-white"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
      
      {/* Main content */}
      <div className="flex-1 overflow-auto">
        <div className="p-6">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
