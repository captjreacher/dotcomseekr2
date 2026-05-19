import { useEffect, useState } from 'react';
import { API_MODE, healthCheck } from '../lib/api';

function HealthTestPage() {
  const [status, setStatus] = useState('checking');
  const [payload, setPayload] = useState<unknown>(null);

  useEffect(() => {
    healthCheck()
      .then((result) => {
        setPayload(result);
        setStatus('ok');
        console.info('DotcomSeekr health check', result);
      })
      .catch((error) => {
        setPayload({ error: error.message });
        setStatus('error');
        console.error('DotcomSeekr health check failed', error);
      });
  }, []);

  return (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
      <h1>Health Test</h1>
      <p>Mode: {API_MODE}</p>
      <p>Status: {status}</p>
      <pre
        style={{
          padding: '1rem',
          overflow: 'auto',
          background: '#111',
          border: '1px solid #333',
          borderRadius: '4px',
        }}
      >
        {JSON.stringify(payload, null, 2)}
      </pre>
    </div>
  );
}

export default HealthTestPage;
