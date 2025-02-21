import { Request, Response } from 'express';
import { exec } from 'child_process';
import * as fs from 'fs/promises';
import express from 'express';
import cors from 'cors';

const app = express();
const port = 3000;

app.use(express.json());
app.use(cors());

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

async function checkRepoExists(repoName: string): Promise<boolean> {
  const url = `https://api.github.com/repos/${repoName}`;
  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        'User-Agent': 'mosip-activity-tracker' // Add User-Agent header
      }
    });
    return response.ok;
  } catch (error) {
    console.error("Error checking repository existence:", error);
    return false;
  }
}

app.post('/api/addRepo', async (req: Request, res: Response): Promise<void> => {
  const repoName = req.body.repoName;

  if (!repoName) {
    res.status(400).json({ error: 'Repository name is required' });
    return;
  }

  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repoName)) {
    res.status(400).json({ error: 'Invalid repository name format. Use owner/repo.' });
    return;
  }

  const exists = await checkRepoExists(repoName);
  if (!exists) {
    res.status(404).json({ error: `Repository ${repoName} not found on GitHub` });
    return;
  }

  try {
    // Append repository name to config.properties file
    await fs.appendFile('config.properties', `\n${repoName}=${repoName}`);

    // Execute Python script
    const { stdout, stderr } = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      const child = exec('python github_activity.py');

      let stdoutData = '';
      let stderrData = '';

      child.stdout?.on('data', (data) => {
        stdoutData += data;
      });
      child.stderr?.on('data', (data) => {
        stderrData += data;
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout: stdoutData, stderr: stderrData });
        } else {
          reject(new Error(`Python script exited with code ${code}: ${stderrData}`));
        }
      });
    });

    // Handle Python script output
    if (stderr) {
      console.error('Python script stderr:', stderr);
      res.status(500).json({ error: `Python script failed: ${stderr}` });
      return;
    }

    console.log('Python script stdout:', stdout);
    res.json({ message: 'Repository added successfully', output: stdout });
  } catch (error: any) {
    console.error('Error adding repository:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
