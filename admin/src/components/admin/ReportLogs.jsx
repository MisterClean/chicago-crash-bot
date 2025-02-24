// src/components/admin/ReportLogs.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';

const ReportLogs = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const response = await axios.get('/api/admin/report-logs');
        setLogs(response.data);
      } catch (err) {
        console.error('Error fetching report logs:', err);
        setError('Failed to load report logs. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    
    fetchLogs();
  }, []);

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
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Report Generation Logs</h1>
      
      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <ul className="divide-y divide-gray-200">
          {logs.length > 0 ? (
            logs.map(log => (
              <li key={log.id}>
                <div className="px-4 py-4 sm:px-6">
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
                        <span>Duration: {log.end_time ? 
                          Math.round((new Date(log.end_time) - new Date(log.start_time)) / 1000) + ' seconds' : 
                          'In progress'}</span>
                        {log.emails_sent !== null && (
                          <span className="ml-4">Emails sent: {log.emails_sent}</span>
                        )}
                      </p>
                    </div>
                  </div>
                  {log.error_message && (
                    <div className="mt-2 text-sm text-red-600">
                      Error: {log.error_message}
                    </div>
                  )}
                </div>
              </li>
            ))
          ) : (
            <li className="px-4 py-4 sm:px-6 text-sm text-gray-500">
              No report generation logs found
            </li>
          )}
        </ul>
      </div>
    </div>
  );
};

export default ReportLogs;