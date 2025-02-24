// client/src/components/about/AboutPage.jsx
import React from 'react';

const AboutPage = () => {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">About the Chicago Traffic Safety Dashboard</h1>
        
        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Our Mission</h2>
          <p className="text-gray-700 mb-4">
            The Chicago Traffic Safety Dashboard is dedicated to improving road safety in Chicago by providing 
            accessible, data-driven insights about traffic crashes. Our mission is to help policymakers, 
            community advocates, and residents understand crash patterns and trends to support more informed 
            decision-making and safer streets for all.
          </p>
        </section>
        
        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">About the Data</h2>
          <p className="text-gray-700 mb-4">
            This dashboard uses official crash data from the City of Chicago Data Portal. The data comes from 
            crash reports filed by the Chicago Police Department and represents crashes on city streets within 
            Chicago city limits.
          </p>
          <p className="text-gray-700 mb-4">
            The crash data shows information about each traffic crash, including:
          </p>
          <ul className="list-disc pl-8 mb-4 text-gray-700">
            <li>Location and time of crash</li>
            <li>Road conditions and weather</li>
            <li>Crash type and severity</li>
            <li>Contributing factors</li>
            <li>Information about injuries and fatalities</li>
            <li>Involvement of pedestrians, cyclists, and other vulnerable road users</li>
          </ul>
          <p className="text-gray-700 mb-4">
            Data is updated daily from the Chicago Data Portal. Citywide data is available from September 2017 
            forward, with some limited data available for certain police districts in 2015-2017.
          </p>
        </section>
        
        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Data Limitations</h2>
          <p className="text-gray-700 mb-4">
            While we strive to provide accurate and comprehensive information, users should be aware of 
            some limitations in the data:
          </p>
          <ul className="list-disc pl-8 mb-4 text-gray-700">
            <li>
              About half of all crash reports are self-reported at police stations, while the other half 
              are recorded at the scene by responding officers.
            </li>
            <li>
              Crash details such as road conditions, weather, and contributing factors are based on officer 
              judgment and may not always match other sources.
            </li>
            <li>
              Minor crashes may be underreported, particularly those with no injuries or minimal property damage.
            </li>
            <li>
              Data does not include crashes on interstate highways, freeway ramps, or roads along the city boundary 
              where other police agencies might respond.
            </li>
            <li>
              There can be a delay between when a crash occurs and when it appears in the data portal.
            </li>
          </ul>
        </section>
        
        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">How to Use This Dashboard</h2>
          <p className="text-gray-700 mb-4">
            The Chicago Traffic Safety Dashboard offers several ways to explore and use crash data:
          </p>
          <ul className="list-disc pl-8 mb-4 text-gray-700">
            <li>
              <strong>Interactive Dashboard:</strong> Explore crash data through visualizations, 
              filter by location and time, and identify patterns and hotspots.
            </li>
            <li>
              <strong>Email Reports:</strong> Subscribe to weekly or monthly reports for your area of interest, 
              such as a specific ward, house district, senate district, or the entire city.
            </li>
            <li>
              <strong>Crash Hotspots:</strong> View the hexagon heatmap to identify areas with high concentrations 
              of crashes, injuries, or fatalities.
            </li>
            <li>
              <strong>Vulnerable Road Users:</strong> Examine crashes involving pedestrians, cyclists, and 
              children to understand safety challenges for these groups.
            </li>
          </ul>
        </section>
        
        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Contact Us</h2>
          <p className="text-gray-700 mb-4">
            Have questions, feedback, or suggestions? We'd love to hear from you! Please contact us at:
          </p>
          <p className="text-gray-700">
            <a href="mailto:contact@example.com" className="text-blue-600 hover:text-blue-800">
              contact@example.com
            </a>
          </p>
        </section>
        
        <section>
          <h2 className="text-2xl font-semibold mb-4">Acknowledgments</h2>
          <p className="text-gray-700 mb-4">
            We would like to thank the City of Chicago for making this data publicly available, 
            and all the community advocates working to make Chicago's streets safer for everyone.
          </p>
        </section>
      </div>
    </div>
  );
};

export default AboutPage;