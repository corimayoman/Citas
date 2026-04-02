'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Camera, Trash2 } from 'lucide-react';
import { useState } from 'react';

interface Screenshot {
  name: string;
  size: number;
  createdAt: string;
}

export default function AdminScreenshotsPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

  const { data: screenshots, isLoading } = useQuery<Screenshot[]>({
    queryKey: ['admin-screenshots'],
    queryFn: () => api.get('/admin/screenshots').then(r => r.data.data),
    refetchInterval: 10_000,
  });

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-2">
        <Camera className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-xl font-semibold text-foreground">Screenshots de diagnóstico</h2>
      </div>

      {isLoading ? (
        <div className="animate-pulse space-y-2">
          {[...Array(3)].map((_, i) => <div key={i} className="h-10 bg-secondary rounded" />)}
        </div>
      ) : !screenshots?.length ? (
        <div className="bg-card rounded-lg border border-border p-8 text-center text-muted-foreground">
          <Camera className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No hay screenshots de diagnóstico.</p>
          <p className="text-xs mt-1">Se generan automáticamente cuando un conector detecta un error.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-card rounded-lg border border-border divide-y divide-border">
            {screenshots.map(s => (
              <button
                key={s.name}
                onClick={() => setSelected(selected === s.name ? null : s.name)}
                className="w-full flex items-center justify-between p-3 text-left hover:bg-input transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{s.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(s.createdAt).toLocaleString()} · {(s.size / 1024).toFixed(0)} KB
                  </p>
                </div>
              </button>
            ))}
          </div>

          {selected && (
            <div className="bg-card rounded-lg border border-border p-4">
              <p className="text-sm font-medium text-foreground mb-2">{selected}</p>
              <img
                src={`${apiUrl}/admin/screenshots/${selected}`}
                alt={selected}
                className="w-full rounded border border-border"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
