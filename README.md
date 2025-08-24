# MetriX - TTS/STT Benchmarking Dashboard

A comprehensive benchmarking dashboard for Text-to-Speech (TTS) and Speech-to-Text (STT) services, featuring multiple vendor integrations and performance metrics.

## Features

- **Multi-Vendor Support**: ElevenLabs, Deepgram, AWS, Azure OpenAI
- **Performance Metrics**: WER, RTF, Latency, TTFB, Audio Duration
- **Test Modes**: Isolated (TTS/STT) and Chained (TTS→STT)
- **Batch Testing**: Support for multiple scripts and formats
- **Real-time Dashboard**: Live statistics and insights
- **Export Capabilities**: CSV and PDF export options
- **User Ratings**: Subjective quality assessment system

## Project Structure

```
MetriX/
├── backend/           # FastAPI server
│   ├── app/          # Application modules
│   ├── server.py     # Main server entry point
│   └── requirements.txt
├── frontend/         # React application
│   ├── src/          # Source code
│   ├── package.json  # Dependencies
│   └── public/       # Static assets
└── data/             # Database and storage
```

## Quick Start

### Backend Setup

1. **Create Python Virtual Environment**
   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. **Install Dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Run the Server**
   ```bash
   python server.py
   ```
   
   The server will start on `http://localhost:8001`

### Frontend Setup

1. **Install pnpm** (if not already installed)
   ```bash
   npm install -g pnpm
   ```

2. **Install Dependencies**
   ```bash
   cd frontend
   pnpm install
   ```

3. **Start Development Server**
   ```bash
   pnpm start
   ```
   
   The frontend will open in your browser at `http://localhost:3000`

## Usage

### Dashboard
- View real-time statistics and performance metrics
- Monitor vendor usage and service mix
- Track recent test runs and their status

### Quick Test
- Test single phrases across multiple vendors
- Choose between isolated TTS/STT or chained mode
- Configure vendor-specific models and settings

### Batch Test
- Run tests using predefined script collections
- Paste custom batch scripts in TXT, CSV, or JSONL format
- Execute comprehensive performance evaluations

### Results
- Detailed analysis of test runs
- Audio playback and transcript viewing
- Export results in multiple formats
- User rating system for quality assessment

## API Endpoints

- `GET /api/dashboard/stats` - Dashboard statistics
- `GET /api/dashboard/insights` - Performance insights
- `POST /api/runs/quick` - Quick test execution
- `POST /api/runs` - Batch test execution
- `GET /api/runs` - Test run results
- `GET /api/scripts` - Available test scripts
- `POST /api/export` - Export results

## Environment Variables

Create `.env` files in both `backend/` and `frontend/` directories:

**Backend (.env)**
```env
CORS_ORIGINS=*
DATABASE_URL=sqlite:///./data/benchmark.db
```

**Frontend (.env)**
```env
REACT_APP_BACKEND_URL=http://localhost:8001
```

