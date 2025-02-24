import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import HexbinLayer from './HexbinLayer';

// Fix for Leaflet marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: '/images/marker-icon-2x.png',
  iconUrl: '/images/marker-icon.png',
  shadowUrl: '/images/marker-shadow.png',
});

const CrashHeatmap = ({ data }) => {
  const [metric, setMetric] = useState('crashes');
  const mapRef = useRef(null);
  const hexbinLayerRef = useRef(null);

  // Default bounds for Chicago
  const defaultBounds = [
    [41.644, -87.940], // Southwest
    [42.020, -87.520]  // Northeast
  ];

  useEffect(() => {
    if (mapRef.current && hexbinLayerRef.current) {
      // Update the hexbin layer when metric changes
      hexbinLayerRef.current.updateData(data, metric);
    }
  }, [data, metric]);

  const metricOptions = [
    { value: 'crashes', label: 'All Crashes' },
    { value: 'injuries', label: 'Injuries' },
    { value: 'incapacitating', label: 'Serious Injuries' },
    { value: 'fatal', label: 'Fatalities' },
    { value: 'pedestrian', label: 'Pedestrian Crashes' },
    { value: 'cyclist', label: 'Cyclist Crashes' },
    { value: 'child', label: 'Child Injuries' }
  ];

  const mapOptions = {
    zoomControl: true,
    attributionControl: true,
    scrollWheelZoom: true
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Crash Heatmap</h2>
        <div className="flex items-center space-x-2">
          <label className="text-sm font-medium text-gray-700">Metric:</label>
          <select 
            value={metric}
            onChange={(e) => setMetric(e.target.value)}
            className="rounded border-gray-300 text-sm"
          >
            {metricOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      
      <div className="h-[600px] rounded-lg overflow-hidden border border-gray-200">
        <MapContainer
          ref={mapRef}
          bounds={defaultBounds}
          style={{ height: '100%', width: '100%' }}
          {...mapOptions}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <HexbinLayer 
            ref={hexbinLayerRef} 
            data={data} 
            metric={metric} 
          />
        </MapContainer>
      </div>
      
      <div className="mt-4 flex justify-between items-center">
        <div className="text-sm text-gray-600">
          <p>Hover over hexagons to see detailed metrics for each area.</p>
        </div>
        
        <div className="flex items-center">
          <span className="text-xs mr-2">Low</span>
          <div className="w-48 h-4 bg-gradient-to-r from-blue-100 via-blue-400 to-blue-800 rounded"></div>
          <span className="text-xs ml-2">High</span>
        </div>
      </div>
    </div>
  );
};

export default CrashHeatmap;
