import React from 'react';

const MetricCard = ({ title, value, description, change, isPositive }) => {
  // Determine if a positive change is good or bad based on the metric
  const isGoodChange = title.includes('Crash') || title.includes('Injur') || title.includes('Fatal') 
    ? !isPositive 
    : isPositive;

  return (
    <div className="bg-white rounded-lg shadow p-5">
      <h3 className="text-lg font-medium text-gray-500">{title}</h3>
      <div className="mt-2 flex items-baseline">
        <p className="text-3xl font-semibold">{value.toLocaleString()}</p>
        {change !== null && (
          <span className={`ml-2 text-sm font-medium ${isGoodChange ? 'text-green-600' : 'text-red-600'}`}>
            {isPositive ? '+' : ''}{change}%
          </span>
        )}
      </div>
      {description && <p className="mt-1 text-sm text-gray-600">{description}</p>}
    </div>
  );
};

const MetricsCards = ({ data }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      <MetricCard 
        title="Total Crashes" 
        value={data.totalCrashes} 
        description="Crashes in selected time period"
        change={data.totalCrashesChange}
        isPositive={data.totalCrashesChange > 0}
      />
      <MetricCard 
        title="Injuries" 
        value={data.totalInjuries} 
        description="People injured in crashes"
        change={data.totalInjuriesChange}
        isPositive={data.totalInjuriesChange > 0}
      />
      <MetricCard 
        title="Serious Injuries" 
        value={data.seriousInjuries} 
        description="Incapacitating injuries"
        change={data.seriousInjuriesChange}
        isPositive={data.seriousInjuriesChange > 0}
      />
      <MetricCard 
        title="Fatalities" 
        value={data.fatalities} 
        description="Fatal injuries in crashes"
        change={data.fatalitiesChange}
        isPositive={data.fatalitiesChange > 0}
      />
      <MetricCard 
        title="Pedestrian Crashes" 
        value={data.pedestrianCrashes} 
        description="Crashes involving pedestrians"
        change={data.pedestrianCrashesChange}
        isPositive={data.pedestrianCrashesChange > 0}
      />
      <MetricCard 
        title="Cyclist Crashes" 
        value={data.cyclistCrashes} 
        description="Crashes involving cyclists"
        change={data.cyclistCrashesChange}
        isPositive={data.cyclistCrashesChange > 0}
      />
      <MetricCard 
        title="Child VRU Injuries" 
        value={data.childVRUCrashes} 
        description="Children (under 18) walking or biking"
        change={data.childVRUCrashesChange}
        isPositive={data.childVRUCrashesChange > 0}
      />
      <MetricCard 
        title="Dooring Incidents" 
        value={data.dooringCrashes} 
        description="Vehicle doors hitting cyclists"
        change={data.dooringCrashesChange}
        isPositive={data.dooringCrashesChange > 0}
      />
    </div>
  );
};

export default MetricsCards;
