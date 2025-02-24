// src/components/admin/BoundariesUpload.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';

const BoundaryTypeCard = ({ title, description, onUpload, boundaries }) => {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);
  
  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setError(null);
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!file) {
      setError('Please select a file to upload');
      return;
    }
    
    // Check file extension
    if (!file.name.toLowerCase().endsWith('.zip')) {
      setError('Only ZIP files containing shapefiles are accepted');
      return;
    }
    
    setUploading(true);
    setError(null);
    
    try {
      await onUpload(file);
      setSuccess(true);
      setFile(null);
      
      // Reset success message after 5 seconds
      setTimeout(() => {
        setSuccess(false);
      }, 5000);
    } catch (err) {
      console.error('Upload error:', err);
      setError(err.response?.data?.error || 'Failed to upload file. Please try again.');
    } finally {
      setUploading(false);
    }
  };
  
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-medium text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-600 mb-4">{description}</p>
      
      {boundaries !== null && (
        <p className="text-sm text-gray-500 mb-4">
          Currently loaded: <span className="font-medium">{boundaries} boundaries</span>
        </p>
      )}
      
      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Upload Shapefile (ZIP)
          </label>
          <input
            type="file"
            accept=".zip"
            onChange={handleFileChange}
            className="block w-full text-sm text-gray-500
              file:mr-4 file:py-2 file:px-4
              file:rounded-md file:border-0
              file:text-sm file:font-medium
              file:bg-blue-50 file:text-blue-700
              hover:file:bg-blue-100"
          />
        </div>
        
        {error && (
          <div className="mb-4 text-sm text-red-600">
            {error}
          </div>
        )}
        
        {success && (
          <div className="mb-4 text-sm text-green-600">
            File uploaded successfully!
          </div>
        )}
        
        <button
          type="submit"
          disabled={uploading || !file}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
        >
          {uploading ? 'Uploading...' : 'Upload'}
        </button>
      </form>
    </div>
  );
};

const BoundariesUpload = () => {
  const [boundariesCount, setBoundariesCount] = useState({
    ward: null,
    police_district: null,
    senate: null,
    house: null
  });
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  useEffect(() => {
    const fetchBoundariesCount = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const response = await axios.get('/api/admin/boundaries-count');
        setBoundariesCount(response.data);
      } catch (err) {
        console.error('Error fetching boundaries count:', err);
        setError('Failed to load boundaries information. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    
    fetchBoundariesCount();
  }, []);
  
  const handleUpload = async (boundaryType, file) => {
    const formData = new FormData();
    formData.append('shapefile', file);
    formData.append('boundaryType', boundaryType);
    
    const response = await axios.post('/api/admin/upload-shapefile', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    
    // Update the boundaries count for this type
    setBoundariesCount(prev => ({
      ...prev,
      [boundaryType]: response.data.count
    }));
    
    return response;
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
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Geographic Boundaries</h1>
      
      <div className="mb-6">
        <p className="text-gray-600">
          Upload shapefiles for geographic boundaries used in the dashboard. These are used for spatial joins and 
          to allow users to subscribe to reports for specific areas.
        </p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <BoundaryTypeCard
          title="Aldermanic Wards"
          description="Chicago's 50 aldermanic wards used for administrative districts."
          onUpload={(file) => handleUpload('ward', file)}
          boundaries={boundariesCount.ward}
        />
        
        <BoundaryTypeCard
          title="Police Districts"
          description="Chicago Police Department districts for tracking crime and enforcement."
          onUpload={(file) => handleUpload('police_district', file)}
          boundaries={boundariesCount.police_district}
        />
        
        <BoundaryTypeCard
          title="State Senate Districts"
          description="Illinois State Senate districts within Chicago city limits."
          onUpload={(file) => handleUpload('senate', file)}
          boundaries={boundariesCount.senate}
        />
        
        <BoundaryTypeCard
          title="State House Districts"
          description="Illinois State House districts within Chicago city limits."
          onUpload={(file) => handleUpload('house', file)}
          boundaries={boundariesCount.house}
        />
      </div>
    </div>
  );
};

export default BoundariesUpload;