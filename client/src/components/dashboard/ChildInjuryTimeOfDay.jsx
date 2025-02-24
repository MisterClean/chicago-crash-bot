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

const ChildInjuryTimeOfDay = ({ data }) => {
  const [selectedCategory, setSelectedCategory] = useState('all');
  
  const filteredData = selectedCategory === 'all' 
    ? data 
    : data.filter(d => d.category === selectedCategory);
  
  // Color-blind safe palette
  const colors = {
    'weekday_school': '#0072B2', // Blue
    'weekday_summer': '#E69F00', // Orange
    'weekend': '#009E73'         // Green
  };
  
  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Child Injuries by Time of Day</h2>
        <div className="flex items-center space-x-2">
          <label className="text-sm font-medium text-gray-700">Filter:</label>
          <select 
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="rounded border-gray-300 text-sm"
          >
            <option value="all">All Categories</option>
            <option value="weekday_school">Weekday (School Year)</option>
            <option value="weekday_summer">Weekday (Summer)</option>
            <option value="weekend">Weekend</option>
          </select>
        </div>
      </div>
      
      <ResponsiveContainer width="100%" height={350}>
        <LineChart
          data={filteredData}
          margin={{ top: 5, right: 30, left: 20, bottom: 30 }}
        >
          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
          <XAxis 
            dataKey="hour" 
            tick={{ fontSize: 12 }} 
            tickFormatter={(hour) => {
              const h = parseInt(hour);
              if (h === 0) return '12 AM';
              if (h === 12) return '12 PM';
              return h < 12 ? `${h} AM` : `${h-12} PM`;
            }}
            label={{ 
              value: 'Hour of Day', 
              position: 'insideBottom', 
              offset: -20 
            }}
          />
          <YAxis 
            tick={{ fontSize: 12 }} 
            label={{ 
              value: 'Number of Children Injured', 
              angle: -90, 
              position: 'insideLeft',
              style: { textAnchor: 'middle' }
            }}
          />
          <Tooltip 
            formatter={(value) => [`${value} injuries`, 'Count']}
            labelFormatter={(hour) => {
              const h = parseInt(hour);
              if (h === 0) return '12:00 AM - 12:59 AM';
              if (h === 12) return '12:00 PM - 12:59 PM';
              return h < 12 
                ? `${h}:00 AM - ${h}:59 AM` 
                : `${h-12}:00 PM - ${h-12}:59 PM`;
            }}
          />
          <Legend />
          {selectedCategory === 'all' ? (
            Object.entries(colors).map(([category, color]) => (
              <Line
                key={category}
                type="monotone"
                dataKey={category}
                name={category.replace('_', ' ').split(' ').map(word => 
                  word.charAt(0).toUpperCase() + word.slice(1)
                ).join(' ')}
                stroke={color}
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 6 }}
              />
            ))
          ) : (
            <Line
              type="monotone"
              dataKey="count"
              name="Injuries"
              stroke={colors[selectedCategory]}
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 6 }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
      
      <div className="mt-4 text-sm text-gray-600">
        <p>The chart shows when children (under 18) are injured in traffic crashes while walking or biking in Chicago.</p>
      </div>
    </div>
  );
};

export default ChildInjuryTimeOfDay;
