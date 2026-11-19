import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

export default function MediaPicker({ label, value, onChange, canUpload }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const media = await api('/admin/media');
      setItems(media.filter(item => item.mime.startsWith('image/')));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const upload = async event => {
    const file = event.target.files[0];
    if (!file) return;
    const input = event.target;
    const body = new FormData();
    body.append('file', file);
    setUploading(true);
    setError('');
    try {
      const item = await api('/admin/media/upload', { method: 'POST', body });
      if (!mounted.current) return;
      setItems(previous => [item, ...previous]);
      onChange(item.url);
      setOpen(false);
    } catch (e) {
      if (mounted.current) setError(e.message);
    } finally {
      if (mounted.current) setUploading(false);
      input.value = '';
    }
  };

  return <div className="col-12">
    <div className="form-label">{label}</div>
    {value && <div className="media-picker-current">
      <img src={value} alt="" />
      <span className="text-break">{value}</span>
      <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => onChange('')}>Remove</button>
    </div>}
    <button type="button" className="btn btn-outline-secondary btn-sm" aria-expanded={open} disabled={uploading} onClick={() => {
      if (!open) load();
      setOpen(!open);
    }}>{open ? 'Close media library' : value ? 'Change image' : 'Select from media library'}</button>
    {open && <div className="media-picker">
      <div className="media-picker-header">
        <strong>Media library</strong>
        {canUpload && <label className="btn btn-outline-secondary btn-sm">
          {uploading ? 'Uploading...' : 'Upload image'}
          <input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={uploading} onChange={upload} />
        </label>}
      </div>
      {error && <div className="alert alert-danger" role="alert">{error} <button type="button" className="btn btn-link btn-sm" onClick={load}>Retry loading</button></div>}
      {loading ? <p>Loading media...</p> : !error && !items.length ? <p>No images in the media library.</p> :
        <div className="media-picker-grid">{items.map(item => <button type="button" key={item.id} className="media-picker-item" title={item.filename} disabled={uploading} onClick={() => { onChange(item.url); setOpen(false); }}>
          <img src={item.url} alt="" /><span>{item.filename}</span>
        </button>)}</div>}
    </div>}
  </div>;
}
