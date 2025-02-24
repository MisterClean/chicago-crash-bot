// src/components/admin/AdminHome.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';

const StatCard = ({ title, value, icon, className }) => (
  <div className={`bg-white rounded-lg shadow p-6 ${className}`}>
    <div className="flex items-center">
      <div className="flex-shrink-0 rounded-md p-3 bg-gray-100">
        {icon}
      </div>
      <div className="ml-5 w-0 flex-1">
        <dt className="text-sm font-medium text-gray-500 truncate">
          {title}
        </dt>
        <dd className="flex items-baseline">
          <div className="text-2xl font-semibold text-gray-900">
            {value}
          </div>
        </dd>
      </div>
    </div>
  </div>
);

const AdminHome = () => {
  const [stats, setStats] = useState(null);
  const [dataLogsRecent, setDataLogsRecent] = useState([]);
  const [reportLogsRecent, setReportLogsRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updating, setUpdating] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [updateSuccess, setUpdateSuccess] = useState(false);
  const [generateSuccess, setGenerateSuccess] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Get subscription stats
        const statsResponse = await axios.get('/api/admin/subscription-stats');
        setStats(statsResponse.data);
        
        // Get recent data logs
        const dataLogsResponse = await axios.get('/api/admin/data-logs');
        setDataLogsRecent(dataLogsResponse.data.slice(0, 5));
        
        // Get recent report logs
        const reportLogsResponse = await axios.get('/api/admin/report-logs');
        setReportLogsRecent(reportLogsResponse.data.slice(0, 5));
      } catch (err) {
        console.error('Error fetching admin data:', err);
        setError('Failed to load dashboard data. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, []);

  const triggerDataUpdate = async () => {
    try {
      setUpdating(true);
      await axios.post('/api/admin/trigger-data-update');
      setUpdateSuccess(true);
      
      // Reset success message after 5 seconds
      setTimeout(() => {
        setUpdateSuccess(false);
      }, 5000);
    } catch (err) {
      console.error('Error triggering data update:', err);
      setError('Failed to trigger data update. Please try again.');
    } finally {
      setUpdating(false);
    }
  };

  const triggerReportGeneration = async (reportType) => {
    try {
      setGenerating(true);
      await axios.post('/api/admin/trigger-report', { reportType });
      setGenerateSuccess(true);
      
      // Reset success message after 5 seconds
      setTimeout(() => {
        setGenerateSuccess(false);
      }, 5000);
    } catch (err) {
      console.error('Error triggering report generation:', err);
      setError('Failed to trigger report generation. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border-l-4 border-red-500 p-4">
        <div className="flex">
          <div className="ml-3">
            <p className="text-sm text-red-700">
              {error}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Dashboard</h1>
      
      {/* Action buttons */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Data Management</h2>
          <p className="text-gray-600 mb-4">
            Trigger a manual update of crash data from the Chicago Data Portal.
          </p>
          <button
            onClick={triggerDataUpdate}
            disabled={updating}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            {updating ? 'Processing...' : 'Update Crash Data Now'}
          </button>
          {updateSuccess && (
            <p className="mt-2 text-sm text-green-600">
              Data update initiated. Check the logs page for progress.
            </p>
          )}
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Report Generation</h2>
          <p className="text-gray-600 mb-4">
            Generate and send reports to all subscribers.
          </p>
          <div className="flex space-x-4">
            <button
              onClick={() => triggerReportGeneration('weekly')}
              disabled={generating}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              {generating ? 'Processing...' : 'Generate Weekly Reports'}
            </button>
            <button
              onClick={() => triggerReportGeneration('monthly')}
              disabled={generating}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              {generating ? 'Processing...' : 'Generate Monthly Reports'}
            </button>
          </div>
          {generateSuccess && (
            <p className="mt-2 text-sm text-green-600">
              Report generation initiated. Check the logs page for progress.
            </p>
          )}
        </div>
      </div>
      
      {/* Stats cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <StatCard
          title="Total Users"
          value={stats?.total_users || 0}
          icon={<svg className="h-6 w-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>}
        />
        <StatCard
          title="Verified Users"
          value={stats?.verified_users || 0}
          icon={<svg className="h-6 w-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>}
        />
        <StatCard
          title="Weekly Subscriptions"
          value={stats?.weekly_subscriptions || 0}
          icon={<svg className="h-6 w-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>}
        />
        <StatCard
          title="Monthly Subscriptions"
          value={stats?.monthly_subscriptions || 0}
          icon={<svg className="h-6 w-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>}
        />
      </div>
      
      {/* Recent logs section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Recent data logs */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-4 py-5 sm:px-6 flex justify-between items-center">
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              Recent Data Updates
            </h3>
            <Link
              to="/admin/data-logs"
              className="text-sm font-medium text-blue-600 hover:text-blue-500"
            >
              View all
            </Link>
          </div>
          <div className="border-t border-gray-200">
            <ul className="divide-y divide-gray-200">
              {dataLogsRecent.length > 0 ? (
                dataLogsRecent.map(log => (
                  <li key={log.id} className="px-4 py-4 sm:px-6">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {new Date(log.start_time).toLocaleString()}
                      </p>
                      <div className="ml-2 flex-shrink-0 flex">
                        <p className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          log.status === 'completed' ? 'bg-green-100 text-green-800' : 
                          log.status === 'failed' ? 'bg-red-100 text-red-800' : 
                          'bg-yellow-100 text-yellow-800'
                        }`}>
                          {log.status}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 sm:flex sm:justify-between">
                      <div className="sm:flex">
                        <p className="flex items-center text-sm text-gray-500">
                          {log.records_fetched && (
                            <span>Fetched: {log.records_fetched}</span>
                          )}
                          {log.records_inserted && (
                            <span className="ml-2">Inserted: {log.records_inserted}</span>
                          )}
                          {log.records_updated && (
                            <span className="ml-2">Updated: {log.records_updated}</span>
                          )}
                        </p>
                      </div>
                    </div>
                  </li>
                ))
              ) : (
                <li className="px-4 py-4 sm:px-6 text-sm text-gray-500">
                  No recent data updates
                </li>
              )}
            </ul>
          </div>
        </div>
        
        {/* Recent report logs */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-4 py-5 sm:px-6 flex justify-between items-center">
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              Recent Report Generations
            </h3>
            <Link
              to="/admin/report-logs"
              className="text-sm font-medium text-blue-600 hover:text-blue-500"
            >
              View all
            </Link>
          </div>
          <div className="border-t border-gray-200">
            <ul className="divide-y divide-gray-200">
              {reportLogsRecent.length > 0 ? (
                reportLogsRecent.map(log => (
                  <li key={log.id} className="px-4 py-4 sm:px-6">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {log.report_type.charAt(0).toUpperCase() + log.report_type.slice(1)} Report - {new Date(log.start_time).toLocaleString()}
                      </p>
                      <div className="ml-2 flex-shrink-0 flex">
                        <p className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          log.status === 'completed' ? 'bg-green-100 text-green-800' : 
                          log.status === 'failed' ? 'bg-red-100 text-red-800' : 
                          'bg-yellow-100 text-yellow-800'
                        }`}>
                          {log.status}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 sm:flex sm:justify-between">
                      <div className="sm:flex">
                        <p className="flex items-center text-sm text-gray-500">
                          {log.emails_sent && (
                            <span>Emails sent: {log.emails_sent}</span>
                          )}
                        </p>
                      </div>
                    </div>
                  </li>
                ))
              ) : (
                <li className="px-4 py-4 sm:px-6 text-sm text-gray-500">
                  No recent report generations
                </li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminHome;
