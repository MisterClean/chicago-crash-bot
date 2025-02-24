import React, { forwardRef, useImperativeHandle, useEffect } from 'react';
import L from 'leaflet';
import { useMap } from 'react-leaflet';

const HexbinLayer = forwardRef(({ data, metric }, ref) => {
  const map = useMap();
  let hexbinLayer = null;
  
  // Color scales for different metrics
  const colorScales = {
    crashes: ['#deebf7', '#9ecae1', '#4292c6', '#08519c'],
    injuries: ['#fee5d9', '#fcae91', '#fb6a4a', '#a50f15'],
    incapacitating: ['#efedf5', '#bcbddc', '#9e9ac8', '#6a51a3'],
    fatal: ['#fee5d9', '#fcbba1', '#fc9272', '#ef3b2c', '#a50f15'],
    pedestrian: ['#e5f5e0', '#a1d99b', '#41ab5d', '#006d2c'],
    cyclist: ['#fff7bc', '#fee391', '#fe9929', '#cc4c02'],
    child: ['#ece7f2', '#a6bddb', '#74a9cf', '#2b8cbe']
  };
  
  useImperativeHandle(ref, () => ({
    updateData: (newData, newMetric) => {
      if (hexbinLayer) {
        map.removeLayer(hexbinLayer);
      }
      createHexbinLayer(newData, newMetric);
    }
  }));
  
  const createHexbinLayer = (hexData, selectedMetric) => {
    if (!hexData || hexData.length === 0) return;
    
    // Find the range of values for the selected metric
    const metricKey = `${selectedMetric}Count`;
    const values = hexData.map(h => h[metricKey]);
    const maxValue = Math.max(...values);
    
    // Create a color function based on the metric's value
    const getColor = (value) => {
      if (value === 0) return 'transparent';
      
      const scale = colorScales[selectedMetric] || colorScales.crashes;
      const normalizedValue = value / maxValue;
      
      if (normalizedValue <= 0.25) return scale[0];
      if (normalizedValue <= 0.5) return scale[1];
      if (normalizedValue <= 0.75) return scale[2];
      return scale[3];
    };
    
    // Create hexbin layer with GeoJSON
    hexbinLayer = L.geoJSON(hexData.map(hex => ({
      type: 'Feature',
      properties: {
        id: hex.id,
        crashes: hex.crashCount,
        injuries: hex.injuryCount,
        incapacitating: hex.incapacitatingCount,
        fatal: hex.fatalCount,
        pedestrian: hex.pedestrianCount,
        cyclist: hex.cyclistCount,
        child: hex.childCount,
        dooring: hex.dooringCount
      },
      geometry: hex.geometry
    })), {
      style: (feature) => {
        return {
          fillColor: getColor(feature.properties[selectedMetric]),
          weight: 1,
          opacity: 0.8,
          color: '#666',
          fillOpacity: 0.7
        };
      },
      onEachFeature: (feature, layer) => {
        // Add tooltip with info
        const props = feature.properties;
        const tooltipContent = `
          <div style="font-size: 12px; font-weight: bold; margin-bottom: 5px;">
            Crash Statistics
          </div>
          <table style="border-collapse: collapse; width: 100%;">
            <tr>
              <td style="padding: 3px;">Crashes:</td>
              <td style="padding: 3px; text-align: right;">${props.crashes.toLocaleString()}</td>
            </tr>
            <tr>
              <td style="padding: 3px;">Injuries:</td>
              <td style="padding: 3px; text-align: right;">${props.injuries.toLocaleString()}</td>
            </tr>
            <tr>
              <td style="padding: 3px;">Serious Injuries:</td>
              <td style="padding: 3px; text-align: right;">${props.incapacitating.toLocaleString()}</td>
            </tr>
            <tr>
              <td style="padding: 3px;">Fatalities:</td>
              <td style="padding: 3px; text-align: right;">${props.fatal.toLocaleString()}</td>
            </tr>
            <tr>
              <td style="padding: 3px;">Pedestrian Crashes:</td>
              <td style="padding: 3px; text-align: right;">${props.pedestrian.toLocaleString()}</td>
            </tr>
            <tr>
              <td style="padding: 3px;">Cyclist Crashes:</td>
              <td style="padding: 3px; text-align: right;">${props.cyclist.toLocaleString()}</td>
            </tr>
            <tr>
              <td style="padding: 3px;">Child Injuries:</td>
              <td style="padding: 3px; text-align: right;">${props.child.toLocaleString()}</td>
            </tr>
          </table>
        `;
        
        layer.bindTooltip(tooltipContent, {
          sticky: true,
          direction: 'top',
          className: 'custom-tooltip',
          opacity: 0.9
        });
      }
    }).addTo(map);
  };
  
  useEffect(() => {
    createHexbinLayer(data, metric);
    
    return () => {
      if (hexbinLayer) {
        map.removeLayer(hexbinLayer);
      }
    };
  }, []);
  
  return null;
});

export default HexbinLayer;
