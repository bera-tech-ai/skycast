const express = require('express');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/weather', async (req, res) => {
  const city = req.query.city || 'London';
  const apiKey = process.env.OPENWEATHER_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured on server' });
  }

  try {
    // Fetch current weather
    const currentResponse = await axios.get('https://api.openweathermap.org/data/2.5/weather', {
      params: {
        q: city,
        appid: apiKey,
        units: 'metric'
      }
    });

    // Fetch 5-day/3-hour forecast
    const forecastResponse = await axios.get('https://api.openweathermap.org/data/2.5/forecast', {
      params: {
        q: city,
        appid: apiKey,
        units: 'metric'
      }
    });

    const currentData = currentResponse.data;
    const forecastData = forecastResponse.data;

    // Process current weather
    const current = {
      temp: Math.round(currentData.main.temp),
      feels_like: Math.round(currentData.main.feels_like),
      humidity: currentData.main.humidity,
      wind_speed: Math.round(currentData.wind.speed * 3.6), // Convert m/s to km/h
      description: currentData.weather[0].description,
      icon: currentData.weather[0].icon
    };

    // Process hourly forecast (next 24 hours from 3-hour intervals)
    const hourly = forecastData.list.slice(0, 8).map(item => ({
      time: new Date(item.dt * 1000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      temp: Math.round(item.main.temp),
      icon: item.weather[0].icon
    }));

    // Process daily forecast (aggregate 3-hour data into 7 days)
    const dailyMap = {};
    forecastData.list.forEach(item => {
      const date = new Date(item.dt * 1000);
      const dayKey = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

      if (!dailyMap[dayKey]) {
        dailyMap[dayKey] = {
          temps: [],
          icons: [],
          descriptions: []
        };
      }

      dailyMap[dayKey].temps.push(item.main.temp);
      dailyMap[dayKey].icons.push(item.weather[0].icon);
      dailyMap[dayKey].descriptions.push(item.weather[0].description);
    });

    // Take first 7 days from the map
    const dailyEntries = Object.entries(dailyMap).slice(0, 7);

    // If we have fewer than 7 days from forecast, pad with current day
    while (dailyEntries.length < 7) {
      const lastDate = dailyEntries.length > 0 
        ? new Date(dailyEntries[dailyEntries.length - 1][0]) 
        : new Date();
      const nextDate = new Date(lastDate);
      nextDate.setDate(nextDate.getDate() + 1);
      const dayKey = nextDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      dailyEntries.push([dayKey, {
        temps: [current.temp],
        icons: [current.icon],
        descriptions: [current.description]
      }]);
    }

    const daily = dailyEntries.map(([date, data]) => {
      const uniqueIcons = [...new Set(data.icons)];
      const mostCommonIcon = uniqueIcons.sort((a, b) => 
        data.icons.filter(i => i === b).length - data.icons.filter(i => i === a).length
      )[0];

      const uniqueDescriptions = [...new Set(data.descriptions)];
      const mostCommonDesc = uniqueDescriptions.sort((a, b) => 
        data.descriptions.filter(d => d === b).length - data.descriptions.filter(d => d === a).length
      )[0];

      return {
        date: date,
        temp_min: Math.round(Math.min(...data.temps)),
        temp_max: Math.round(Math.max(...data.temps)),
        icon: mostCommonIcon,
        description: mostCommonDesc
      };
    });

    res.json({
      current,
      hourly,
      daily
    });

  } catch (error) {
    if (error.response) {
      const status = error.response.status;
      if (status === 404) {
        return res.status(404).json({ error: 'City not found. Please check the spelling and try again.' });
      } else if (status === 401) {
        return res.status(401).json({ error: 'Invalid API key. Please check your configuration.' });
      } else {
        return res.status(status).json({ error: `Weather service error: ${error.response.data.message || 'Unknown error'}` });
      }
    } else if (error.request) {
      return res.status(503).json({ error: 'Weather service unavailable. Please try again later.' });
    } else {
      return res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
    }
  }
});

app.listen(PORT, () => {
  console.log(`SkyCast server running on http://localhost:${PORT}`);
});