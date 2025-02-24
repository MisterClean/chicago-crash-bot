// client/src/components/layout/Footer.jsx
import React from 'react';
import { Link } from 'react-router-dom';

const Footer = () => {
  const currentYear = new Date().getFullYear();
  
  return (
    <footer className="bg-gray-800 text-white py-8">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <h3 className="text-lg font-bold mb-4">Chicago Traffic Safety</h3>
            <p className="text-gray-400">
              Using data to improve road safety for all Chicagoans.
            </p>
          </div>
          
          <div>
            <h3 className="text-lg font-bold mb-4">Navigation</h3>
            <ul className="space-y-2">
              <li><Link to="/" className="text-gray-400 hover:text-white">Home</Link></li>
              <li><Link to="/dashboard" className="text-gray-400 hover:text-white">Dashboard</Link></li>
              <li><Link to="/subscribe" className="text-gray-400 hover:text-white">Subscribe</Link></li>
              <li><Link to="/about" className="text-gray-400 hover:text-white">About</Link></li>
            </ul>
          </div>
          
          <div>
            <h3 className="text-lg font-bold mb-4">Resources</h3>
            <ul className="space-y-2">
              <li>
                <a 
                  href="https://data.cityofchicago.org/Transportation/Traffic-Crashes-Crashes/85ca-t3if" 
                  className="text-gray-400 hover:text-white"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Chicago Data Portal
                </a>
              </li>
              <li>
                <a 
                  href="https://www.chicago.gov/city/en/depts/cdot/supp_info/vision-zero-chicago.html" 
                  className="text-gray-400 hover:text-white"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Vision Zero Chicago
                </a>
              </li>
            </ul>
          </div>
          
          <div>
            <h3 className="text-lg font-bold mb-4">Contact</h3>
            <p className="text-gray-400">
              Have questions or feedback? Please contact us.
            </p>
            <a 
              href="mailto:contact@example.com"
              className="text-blue-400 hover:text-blue-300 mt-2 inline-block"
            >
              contact@example.com
            </a>
          </div>
        </div>
        
        <div className="border-t border-gray-700 mt-8 pt-8 flex flex-col md:flex-row justify-between">
          <p className="text-gray-400">
            &copy; {currentYear} Chicago Traffic Safety Dashboard
          </p>
          <p className="text-gray-400 mt-2 md:mt-0">
            Data source: <a 
              href="https://data.cityofchicago.org" 
              className="text-blue-400 hover:text-blue-300"
              target="_blank"
              rel="noopener noreferrer"
            >
              City of Chicago Data Portal
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;