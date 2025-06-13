const express = require('express');
const bodyParser = require('body-parser');
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = process.env.PORT || 3000;
app.use(bodyParser.json());

// Ruta al directorio de manifiestos
const manifestDir = path.resolve(__dirname, '../LLMCarbon/LLMCarbon--/manifest');

app.post('/impact/basic', (req, res) => {
  const body = req.body;
  try {
    // Cargar plantilla
    const templatePath = path.join(manifestDir, 'llm-carbon-basic.yml');
    const manifest = yaml.load(fs.readFileSync(templatePath, 'utf8'));
    const inputs = manifest.inputs;
    const defaults = manifest.defaults;

    // Helper para asignar inputs
    const setInput = (key, value) => {
      if (!inputs) return;
      for (const obj of inputs) {
        if (obj.hasOwnProperty(key)) {
          obj[key] = value;
          return;
        }
      }
    };

    // Token counts
    setInput('n_tokens_query', body.n_tokens_query);
    setInput('n_tokens_past_queries', body.n_tokens_past_queries);
    setInput('n_tokens_past_answers', body.n_tokens_past_answers);
    setInput('tokens-per-second', body.tokens_per_second);

    // Hardware y parámetros ambientales
    setInput('gpu/num', body.gpu_num);
    setInput('gpu/tdp', body.gpu_tdp);
    setInput('pue', body.pue);
    setInput('carb_inten', body.carb_inten);
    setInput('gpu/cap', body.gpu_cap);
    setInput('gpu/area', body.gpu_area);
    setInput('cpu/num', body.cpu_num);
    setInput('cpu/cap', body.cpu_cap);
    setInput('cpu/area', body.cpu_area);
    setInput('ssd/num', body.ssd_num);
    setInput('ssd/cap', body.ssd_cap);
    setInput('ssd/area', body.ssd_area);
    setInput('dram/num', body.dram_num);
    setInput('dram/cap', body.dram_cap);
    setInput('dram/area', body.dram_area);
    setInput('expected-lifespan', body.expected_lifespan);

    // Sobrescribir defaults si vienen en el body
    if (defaults) {
      if (body.days_per_year) defaults['days-per-year'] = body.days_per_year;
      if (body.hours_per_day) defaults['hours-per-day'] = body.hours_per_day;
      if (body.seconds_per_hour) defaults['seconds-per-hour'] = body.seconds_per_hour;
      if (body.thousands_per_unit) defaults['thousands-per-unit'] = body.thousands_per_unit;
    }

    // Escribir manifiesto temporal
    const tempPath = path.join(__dirname, `${uuidv4()}.yml`);
    fs.writeFileSync(tempPath, yaml.dump(manifest));

    // Ejecutar CLI Impact Framework
    const cli = spawn('ie', ['--manifest', tempPath, '--output', '-'], { cwd: manifestDir });
    let stdout = '';
    let stderr = '';
    cli.stdout.on('data', data => stdout += data);
    cli.stderr.on('data', data => stderr += data);
    cli.on('close', code => {
      fs.unlinkSync(tempPath);
      if (code !== 0) return res.status(500).json({ error: stderr || `CLI exited ${code}` });
      const result = yaml.load(stdout);
      res.json(result);
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => console.log(`Impact service listening on http://localhost:${port}`));
