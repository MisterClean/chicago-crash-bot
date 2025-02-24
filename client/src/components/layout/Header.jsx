// client/src/components/layout/Header.jsx
import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();
  
  const isActivePath = (path) => {
    return location.pathname === path;
  };
  
  return (
    <header className="bg-gray-800 text-white">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center py-4">
          <Link to="/" className="text-xl font-bold">Chicago Traffic Safety</Link>
          
          {/* Mobile menu button */}
          <button 
            className="md:hidden focus:outline-none"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            <svg className="h-6 w-6 fill-current" viewBox="0 0 24 24">
              {isMenuOpen ? (
                <path fillRule="evenodd" clipRule="evenodd" d="M18.278 16.864a1 1 0 0 1-1.414 1.414l-4.829-4.828-4.828 4.828a1 1 0 0 1-1.414-1.414l4.828-4.829-4.828-4.828a1 1 0 0 1 1.414-1.414l4.829 4.828 4.828-4.828a1 1 0 1 1 1.414 1.414l-4.828 4.829 4.828 4.828z" />
              ) : (
                <path fillRule="evenodd" d="M4 5h16a1 1 0 0 1 0 2H4a1 1 0 1 1 0-2zm0 6h16a1 1 0 0 1 0 2H4a1 1 0 0 1 0-2zm0 6h16a1 1 0 0 1 0 2H4a1 1 0 0 1 0-2z" />
              )}
            </svg>
          </button>
          
          {/* Desktop menu */}
          <nav className="hidden md:flex space-x-6">
            <Link to="/" className={`hover:text-blue-300 ${isActivePath('/') ? 'text-blue-300' : ''}`}>
              Home
            </Link>
            <Link to="/dashboard" className={`hover:text-blue-300 ${isActivePath('/dashboard') ? 'text-blue-300' : ''}`}>
              Dashboard
            </Link>
            <Link to="/subscribe" className={`hover:text-blue-300 ${isActivePath('/subscribe') ? 'text-blue-300' : ''}`}>
              Subscribe
            </Link>
            <Link to="/about" className={`hover:text-blue-300 ${isActivePath('/about') ? 'text-blue-300' : ''}`}>
              About
            </Link>
          </nav>
        </div>
        
        {/* Mobile menu */}
        {isMenuOpen && (
          <nav className="md:hidden pb-4">
            <Link 
              to="/" 
              className={`block py-2 ${isActivePath('/') ? 'text-blue-300' : ''}`}
              onClick={() => setIsMenuOpen(false)}
            >
              Home
            </Link>
            <Link 
              to="/dashboard" 
              className={`block py-2 ${isActivePath('/dashboard') ? 'text-blue-300' : ''}`}
              onClick={() => setIsMenuOpen(false)}
            >
              Dashboard
            </Link>
            <Link 
              to="/subscribe" 
              className={`block py-2 ${isActivePath('/subscribe') ? 'text-blue-300' : ''}`}
              onClick={() => setIsMenuOpen(false)}
            >
              Subscribe
            </Link>
            <Link 
              to="/about" 
              className={`block py-2 ${isActivePath('/about') ? 'text-blue-300' : ''}`}
              onClick={() => setIsMenuOpen(false)}
            >
              About
            </Link>
          </nav>
        )}
      </div>
    </header>
  );
};

export default Header;