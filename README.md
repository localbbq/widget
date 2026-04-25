# Desktop Widgets

This workspace now contains 3 separate Electron widget projects:

- `weather-widget`: weather widget
- `stocks-widget`: stocks widget
- `sports-widget`: sports widget

## Run each project

Open a terminal in the specific project folder, then run:

```bash
npm install
npm start
```

## Quick step-by-step

1. Obtain API key (OpenWeather for weather, Finnhub for stocks; sports needs none).
2. `cd` to the widget folder (`weather-widget`, `stocks-widget`, or `sports-widget`).
3. Place API key in that widget's `.env` file.
4. Run `npm install`.
5. Run `npm start`.

## API keys 

- Weather (`OPENWEATHER_API_KEY`)
  - Create a free account at [OpenWeather](https://openweathermap.org/).
  - Go to your API keys page and copy a key.
  - Put it in `weather-widget/.env` as `OPENWEATHER_API_KEY=your_key`.
- Stocks (`FINNHUB_API_KEY`)
  - Create a free account at [Finnhub](https://finnhub.io/).
  - Generate/copy your API token from the dashboard.
  - Put it in `stocks-widget/.env` as `FINNHUB_API_KEY=your_key`.
- Sports
  - Current ESPN scoreboard endpoint in this project does not require an API key.
