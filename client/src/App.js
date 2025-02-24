// client/src/App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import axios from 'axios';

// Layout components
import Header from './components/layout/Header';
import Footer from './components/layout/Footer';

// Page components
import Dashboard from './components/dashboard/Dashboard';
import SubscriptionForm from './components/subscription/SubscriptionForm';
import VerifyEmail from './components/subscription/VerifyEmail';
import Unsubscribe from './components/subscription/Unsubscribe';
import HomePage from './components/home/HomePage';
import AboutPage from './components/about/AboutPage';
import NotFoundPage from './components/common/NotFoundPage';

// Set axios defaults
axios.defaults.baseURL = process.env.REACT_APP_API_URL || '';

function App() {
  return (
    <Router>
      <div className="min-h-screen flex flex-col">
        <Helmet>
          <title>Chicago Traffic Safety Dashboard</title>
          <meta name="description" content="Interactive visualization of traffic crash data for Chicago streets to improve road safety." />
        </Helmet>
        
        <Header />
        
        <main className="flex-grow">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/subscribe" element={<SubscriptionForm />} />
            <Route path="/verify/:token" element={<VerifyEmail />} />
            <Route path="/unsubscribe/:id" element={<Unsubscribe />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/404" element={<NotFoundPage />} />
            <Route path="*" element={<Navigate to="/404" />} />
          </Routes>
        </main>
        
        <Footer />
      </div>
    </Router>
  );
}

export default App;
