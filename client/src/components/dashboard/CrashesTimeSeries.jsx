import React, { useState } from 'react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer 
} from 'recharts';

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-4 border rounded shadow-md">
        <p className="font-bold">{label}</p>
        {payload.map((entry, index) => (
          <p key={index} style={{ color: entry.color }}>
            {entry.name}: {entry.value.toLocaleString()}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

const CrashesTimeSeries = ({ data }) => {
  const [metricType, setMetricType] = useState('crashes');
  const [interval, setInterval] = useState('weekly');
  
  const metrics = {
    crashes: { 
      name: 'Crashes', 
      color: '#2563EB', 
      dataKey: 'crashes' 
    },
    injuries: { 
      name: 'Injuries', 
      color: '#DC2626', 
      dataKey: 'injuries' 
    },
    seriousInjuries: { 
      name: 'Serious Injuries', 
      color: '#9D174D', 
      dataKey: 'seriousInjuries' 
    },
    pedestrians: { 
      name: 'Pedestrian Crashes', 
      color: '#059669', 
      dataKey: 'pedestrianCrashes' 
    },
    cyclists: { 
      name: 'Cyclist Crashes', 
      color: '#D97706', 
      dataKey: 'cyclistCrashes' 
    }
  };
  
  const currentMetric = metrics[metricType];
  const chartData = data[interval] || [];
  
  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Time Series Data</h2>
        <div className="flex space-x-2">
          <div className="flex items-center space-x-2">
            <label className="text-sm font-medium text-gray-700">Metric:</label>
            <select 
              value={metricType}
              onChange={(e) => setMetricType(e.target.value)}
              className="rounded border-gray-300 text-sm"
            >
              <option value="crashes">Crashes</option>
              <option value="injuries">Injuries</option>
              <option value="seriousInjuries">Serious Injuries</option>
              <option value="pedestrians">Pedestrian Crashes</option>
              <option value="cyclists">Cyclist Crashes</option>
            </select>
          </div>
          
          <div className="flex items-center space-x-2">
            <label className="text-sm font-medium text-gray-700">Interval:</label>
            <select 
              value={interval}
              onChange={(e) => setInterval(e.target.value)}
              className="rounded border-gray-300 text-sm"
            >
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="daily">Daily</option>
            </select>
          </div>
        </div>
      </div>
      
      <ResponsiveContainer width="100%" height={350}>
        <LineChart
          data={chartData}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
          <XAxis dataKey="period" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Line
            type="monotone"
            dataKey={currentMetric.dataKey}
            name={currentMetric.name}
            stroke={currentMetric.color}
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 6 }}
          />
          {/* Show previous year line for comparison */}
          {chartData[0] && chartData[0][`prev${currentMetric.dataKey.charAt(0).toUpperCase() + currentMetric.dataKey.slice(1)}`] && (
            <Line
              type="monotone"
              dataKey={`prev${currentMetric.dataKey.charAt(0).toUpperCase() + currentMetric.dataKey.slice(1)}`}
              name={`Previous Year ${currentMetric.name}`}
              stroke={currentMetric.color}
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={{ r: 2 }}
              opacity={0.6}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default CrashesTimeSeries;
