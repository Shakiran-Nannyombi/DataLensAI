import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import {join} from 'node:path';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

import { GoogleGenAI, Type } from '@google/genai';
import multer from 'multer';

// Mock DOMMatrix to prevent pdf.js startup crash
if (typeof (globalThis as any).DOMMatrix === 'undefined') {
  (globalThis as any).DOMMatrix = class DOMMatrix {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    is2D = true;
    constructor() {}
  };
}
if (typeof (globalThis as any).Path2D === 'undefined') {
  (globalThis as any).Path2D = class Path2D {};
}
if (typeof (globalThis as any).ImageData === 'undefined') {
  (globalThis as any).ImageData = class ImageData {};
}

const upload = multer({ storage: multer.memoryStorage() });

let aiClient: GoogleGenAI | null = null;
function getAiClient(): GoogleGenAI {
  if (!aiClient) {
    if (!process.env['GEMINI_API_KEY']) {
      throw new Error('GEMINI_API_KEY is not set');
    }
    aiClient = new GoogleGenAI({ apiKey: process.env['GEMINI_API_KEY'] });
  }
  return aiClient;
}

app.post('/api/analyze', upload.single('data_file'), async (req, res) => {
  try {
    const ai = getAiClient();
    const file = req.file;
    const targetGoal = req.body.targetGoal;

    if (!file) {
      res.status(400).json({ error: 'No data file provided.' });
      return;
    }
    if (!targetGoal) {
      res.status(400).json({ error: 'Target goal is required.' });
      return;
    }

    let fileContent = '';
    const originalName = file.originalname || '';
    const fileExt = originalName.split('.').pop()?.toLowerCase() || '';
    const mimetype = file.mimetype || '';

    if (mimetype.includes('pdf') || fileExt === 'pdf') {
      const pdfParseModule = await import('pdf-parse');
      const PDFParse = pdfParseModule.PDFParse;
      const parser = new PDFParse({ data: file.buffer });
      const pdfData = await parser.getText();
      fileContent = pdfData.text;
    } else if (fileExt === 'xlsx' || fileExt === 'xls' || mimetype.includes('excel') || mimetype.includes('spreadsheet')) {
      const xlsx = await import('xlsx');
      const workbook = xlsx.read(file.buffer, { type: 'buffer' });
      workbook.SheetNames.forEach(sheetName => {
        fileContent += `\n--- Sheet: ${sheetName} ---\n`;
        fileContent += xlsx.utils.sheet_to_csv(workbook.Sheets[sheetName]);
      });
    } else {
      fileContent = file.buffer.toString('utf-8');
    }

    // To prevent sending excessively large text to the model
    if (fileContent.length > 200000) {
       fileContent = fileContent.substring(0, 200000);
    }

    const prompt = `You are an expert Data Scientist and Business Intelligence AI. Your core objective is to analyze uploaded datasets and extract high-value insights, explicit findings, and a core summary tailored EXACTLY to the user's stated target goal.

Target Goal: ${targetGoal}

Data Document:
${fileContent}

Analyze the data and return a JSON object exactly matching this schema. Do not include markdown formatting or extra text outside the JSON. All JSON fields must be present.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
             executive_summary: { type: Type.STRING, description: "A dense, high-level narrative explaining what the data indicates specifically regarding the target goal (2-3 sentences max)." },
             key_findings: { 
                 type: Type.ARRAY, 
                 items: { type: Type.STRING }, 
                 description: "Exactly 2 to 4 high-impact, fact-driven findings found in the data, citing specific metrics." 
             },
             chart: {
                 type: Type.OBJECT,
                 properties: {
                     chartType: { type: Type.STRING, enum: ["bar", "line", "pie"], description: "The most logical chart format" },
                     data: {
                         type: Type.ARRAY,
                         items: {
                             type: Type.OBJECT,
                             properties: {
                                label: { type: Type.STRING },
                                baseline: { type: Type.NUMBER },
                                optimized: { type: Type.NUMBER }
                             },
                             required: ["label", "baseline", "optimized"]
                         }
                     }
                 },
                 required: ["chartType", "data"]
             }
          },
          required: ["executive_summary", "key_findings", "chart"]
        }
      }
    });

    if (response.text) {
       const result = JSON.parse(response.text);
       res.json(result);
    } else {
       res.status(500).json({ error: 'Failed to generate insights from the data.' });
    }
  } catch (err: any) {
    console.error('Error in /api/analyze:', err);
    res.status(500).json({ error: err.message || 'Internal server error.' });
  }
});

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
