# Chicago Traffic Safety Dashboard

A comprehensive traffic safety analytics platform using Chicago's crash data to help identify patterns, hotspots, and trends to improve road safety.

## Project Overview

This application provides both interactive web dashboards and automated email reports showing traffic crash data from the City of Chicago. The goal is to make crash data accessible and actionable for policymakers, community advocates, and the public to support data-driven road safety improvements.

### Key Features

- **Interactive Web Dashboards:** Explore crash data through dynamic visualizations
- **Email Report Subscriptions:** Receive customized crash reports on a weekly or monthly basis
- **Geographic Analysis:** View crash hotspots and patterns at various geographic levels
- **Temporal Analysis:** Track trends over time with seasonal and historical comparisons
- **Focus on Vulnerable Users:** Special attention to crashes involving pedestrians, cyclists, and children

## System Architecture

![System Architecture](https://placeholder-for-architecture-diagram.com/image.png)

### Frontend

- React.js application with responsive design
- Interactive data visualizations using Recharts and Leaflet
- User subscription management
- Admin portal for system management

### Backend

- Node.js Express application
- Data pipeline for fetching and processing Chicago crash data
- PostgreSQL database with PostGIS for spatial data
- CRM system for managing user subscriptions
- Report generation system for email delivery

### Data Sources

- Chicago Data Portal API - Traffic Crashes dataset
- GIS shapefiles for political boundaries (wards, legislative districts)
- Police district boundaries

## Local Development Setup

### Prerequisites

- Node.js (v18+)
- PostgreSQL (v14+) with PostGIS extension
- Docker (for containerized deployment)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/chicago-safety-dashboard.git
cd chicago-safety-dashboard

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your local configuration

# Initialize the database
npm run db:setup

# Start development server
npm run dev
```

## Data Pipeline

The application includes a robust data pipeline that:

1. Initially imports all historical crash data
2. Performs regular incremental updates
3. Handles upserts for modified records
4. Processes and enriches data with geographic information
5. Aggregates metrics for reporting

The pipeline is designed to handle inconsistencies in the source data publishing schedule and retroactive updates to historical records.

## Deployment

The application is designed to be deployed on AWS Lightsail:

```bash
# Build production assets
npm run build

# Deploy using the provided script
./scripts/deploy-lightsail.sh
```

Alternatively, you can use the Docker configuration:

```bash
docker-compose up -d
```

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

This project is open source under the MIT License. See [LICENSE](LICENSE) for details.

## Acknowledgments

- City of Chicago for providing open access to crash data
- All contributors and community members working to improve traffic safety