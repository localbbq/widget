# Widget Dashboard

This workspace contains one Electron dashboard app:

- `dashboard-widget`: single page with weather, stocks, and sports panels that are click-and-draggable.

## Run the dashboard

Open a terminal in `dashboard-widget`, then run:

```bash
npm install
npm start
```

## Quick step-by-step

1. Obtain API key (OpenWeather for weather, Finnhub for stocks; sports needs none).
2. `cd` to the dashboard-widget folder.
3. Place API keys in the folder's `.env` file (remove the '.example' from the .env or create a new .env).
4. Run `npm install`.
5. Run `npm start`.

## API keys

- Weather (`OPENWEATHER_API_KEY`)
  - Create a free account at [OpenWeather](https://openweathermap.org/).
  - Go to your API keys page and copy a key.
  - Put it in `dashboard-widget/.env` as `OPENWEATHER_API_KEY=your_key`.
- Stocks (`FINNHUB_API_KEY`)
  - Create a free account at [Finnhub](https://finnhub.io/).
  - Generate/copy your API token from the dashboard.
  - Put it in `dashboard-widget/.env` as `FINNHUB_API_KEY=your_key`.
- Sports
  - Current ESPN scoreboard endpoint in this project does not require an API key.
