import React, { useState } from 'react';
import axios from 'axios';

const SubscriptionForm = ({ geoType, geoId }) => {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [reportType, setReportType] = useState('weekly');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Basic validation
    if (!email) {
      setError('Email is required');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      await axios.post('/api/subscriptions', {
        email,
        name,
        reportType,
        geoType,
        geoId
      });
      
      setSuccess(true);
      setEmail('');
      setName('');
      
      // Reset success message after 5 seconds
      setTimeout(() => {
        setSuccess(false);
      }, 5000);
    } catch (err) {
      console.error('Error creating subscription:', err);
      setError(err.response?.data?.message || 'Failed to create subscription. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {!success ? (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Email</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="your@email.com"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">Name (optional)</label>
            <input 
              type="text" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Your name"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">Report Frequency</label>
            <select 
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          
          <div>
            <p className="text-sm text-gray-600">
              You will receive {reportType} crash reports for the {geoType === 'citywide' 
                ? 'entire city of Chicago' 
                : `selected ${geoType} ${geoId && `(${geoId})`}`}
            </p>
          </div>
          
          {error && (
            <div className="text-red-500 text-sm">
              {error}
            </div>
          )}
          
          <div>
            <button 
              type="submit"
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              disabled={loading}
            >
              {loading ? 'Subscribing...' : 'Subscribe to Reports'}
            </button>
          </div>
        </form>
      ) : (
        <div className="bg-green-50 p-4 rounded-md">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-green-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-green-800">Subscription successful!</h3>
              <div className="mt-2 text-sm text-green-700">
                <p>You have been subscribed to {reportType} traffic safety reports.</p>
                <p className="mt-1">Please check your email to confirm your subscription.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SubscriptionForm;
