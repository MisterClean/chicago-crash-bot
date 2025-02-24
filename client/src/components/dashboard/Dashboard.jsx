import React, { useState, useEffect } from 'react';
import axios from 'axios';
import MetricsCards from './MetricsCards';
import CrashesTimeSeries from './CrashesTimeSeries';
import ChildInjuryTimeOfDay from './ChildInjuryTimeOfDay';
import CrashHeatmap from './CrashHeatmap';
import GeographicSelector from './GeographicSelector';
import DateRangeSelector from './DateRangeSelector';
import SubscriptionForm from './SubscriptionForm';

const Dashboard = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dashboardData, setDashboardData] = useState(null);
  const [geoType, setGeoType] = useState('citywide');
  const [geoId, setGeoId] = useState(null);
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // Last 90 days
    end: new Date()
  });

  useEffect(() => {
    fetchDashboardData();
  }, [geoType, geoId, dateRange]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = {
        geoType,
        geoId,
        startDate: dateRange.start.toISOString().split('T')[0],
        endDate: dateRange.end.toISOString().split('T')[0]
      };

      const response = await axios.get('/api/dashboard', { params });
      setDashboardData(response.data);
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setError('Failed to load dashboard data. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const handleGeoChange = (type, id) => {
    setGeoType(type);
    setGeoId(id);
  };

  const handleDateRangeChange = (newRange) => {
    setDateRange(newRange);
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
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
        <strong className="font-bold">Error!</strong>
        <span className="block sm:inline"> {error}</span>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8 text-center">Chicago Traffic Safety Dashboard</h1>
      
      <div className="mb-8 p-4 bg-gray-50 rounded-lg shadow">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <GeographicSelector 
            geoType={geoType} 
            geoId={geoId} 
            onChange={handleGeoChange} 
          />
          <DateRangeSelector 
            dateRange={dateRange} 
            onChange={handleDateRangeChange} 
          />
        </div>
      </div>

      {dashboardData && (
        <>
          <MetricsCards data={dashboardData.metrics} />
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            <div className="bg-white p-4 rounded-lg shadow">
              <CrashesTimeSeries data={dashboardData.timeSeries} />
            </div>
            <div className="bg-white p-4 rounded-lg shadow">
              <ChildInjuryTimeOfDay data={dashboardData.childInjuries} />
            </div>
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow mb-8">
            <CrashHeatmap data={dashboardData.heatmap} />
          </div>
          
          <div className="bg-white p-4 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4">Subscribe to Reports</h2>
            <SubscriptionForm geoType={geoType} geoId={geoId} />
          </div>
        </>
      )}
    </div>
  );
};

export default Dashboard;
