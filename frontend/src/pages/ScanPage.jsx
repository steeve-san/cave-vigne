// src/pages/ScanPage.jsx
import React, { useState, useRef, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sommelierAPI, winesAPI } from '../services/api';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

export default function ScanPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);

  const scanMutation = useMutation({
    mutationFn: (fd) => sommelierAPI.scan(fd).then(r => r.data),
    onSuccess: (data) => { if (data.error) toast.error('Aucune étiquette détectée'); else setResult(data); },
    onError: () => toast.error('Erreur d\'analyse'),
  });

  const addMutation = useMutation({
    mutationFn: (fd) => winesAPI.create(fd),
    onSuccess: () => { qc.invalidateQueries(['wines']); qc.invalidateQueries(['wine-stats']); toast.success('Vin ajouté à la cave !'); navigate('/wines'); },
    onError: () => toast.error('Erreur lors de l\'ajout'),
  });

  const analyse = (file) => {
    const url = URL.createObjectURL(file);
    setPreview(url); setResult(null);
    const fd = new FormData(); fd.append('label', file);
    scanMutation.mutate(fd);
  };

  const onDrop = useCallback((files) => { if (files[0]) analyse(files[0]); }, []);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: { 'image/*': [] }, maxFiles: 1, noClick: false });

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      setCameraOn(true);
    } catch (err) { toast.error('Impossible d\'accéder à la caméra : ' + err.message); }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    setCameraOn(false);
  };

  const capture = () => {
    const video = videoRef.current; const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob(blob => { if (blob) { stopCamera(); analyse(new File([blob], 'capture.jpg', { type: 'image/jpeg' })); } }, 'image/jpeg', 0.9);
  };

  const addToWine = () => {
    if (!result) return;
    const fd = new FormData();
    const fields = { name: result.name || 'Vin scanné', appellation: result.appellation || '', vintage: result.vintage || '', type: ['rouge','blanc','rosé','pétillant'].includes(result.type) ? result.type : 'rouge', producer: result.producer || '', region: result.region || '', grapes: result.grapes || '', country: result.country || 'France', quantity: 1, notes: result.notes || '' };
    Object.entries(fields).forEach(([k, v]) => { if (v !== '' && v != null) fd.append(k, v); });
    addMutation.mutate(fd);
  };

  return (
    <div className="fade-in">
      <div className="row g-3 justify-content-center">
        <div className="col-12 col-lg-8">

          {/* Camera / Upload */}
          <div className="card mb-3">
            <div className="card-header"><h6 className="card-title">Analyser une étiquette</h6></div>
            <div className="card-body">
              {/* Camera view */}
              {cameraOn && (
                <div style={{ position:'relative', background:'#000', borderRadius:10, overflow:'hidden', marginBottom:'1rem' }}>
                  <video ref={videoRef} style={{ width:'100%', display:'block', maxHeight:400, objectFit:'cover' }} muted playsInline />
                  <canvas ref={canvasRef} style={{ display:'none' }} />
                  <div className="scan-frame" />
                  <div className="d-flex gap-2 justify-content-center p-3" style={{ position:'absolute', bottom:0, width:'100%', background:'rgba(0,0,0,0.4)' }}>
                    <button className="btn btn-gold" onClick={capture}><i className="bi bi-camera me-1"></i>Capturer</button>
                    <button className="btn btn-outline-gold" onClick={stopCamera}><i className="bi bi-x me-1"></i>Annuler</button>
                  </div>
                </div>
              )}

              {/* Preview */}
              {preview && !cameraOn && (
                <div className="text-center mb-3">
                  <img src={preview} alt="Étiquette" style={{ maxHeight:280, maxWidth:'100%', borderRadius:10, objectFit:'contain', border:'0.5px solid var(--cv-border2)' }} />
                </div>
              )}

              {/* Dropzone */}
              {!cameraOn && (
                <div {...getRootProps()} className={`dropzone ${isDragActive ? 'active' : ''}`}>
                  <input {...getInputProps()} />
                  <i className="bi bi-camera d-block mb-2" style={{ fontSize:'2.5rem' }}></i>
                  <div style={{ fontSize:'0.9rem', marginBottom:4 }}>Glissez une photo d'étiquette ici</div>
                  <div style={{ fontSize:'0.75rem', color:'var(--cv-text3)' }}>ou cliquez pour parcourir</div>
                </div>
              )}

              <div className="d-flex gap-2 justify-content-center mt-3">
                {!cameraOn && <button className="btn btn-outline-gold" onClick={startCamera}><i className="bi bi-camera me-1"></i>Utiliser la caméra</button>}
                {scanMutation.isPending && (
                  <div className="d-flex align-items-center gap-2" style={{ color:'var(--cv-text2)', fontSize:'0.85rem' }}>
                    <span className="spinner-border spinner-border-sm" />
                    Analyse de l'étiquette…
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Result */}
          {result && (
            <div className="card fade-in">
              <div className="card-header d-flex align-items-center gap-2">
                <i className="bi bi-check-circle" style={{ color:'#4CAF50', fontSize:'1.1rem' }}></i>
                <h6 className="card-title mb-0">Vin identifié</h6>
                <span className={`badge-${result.confidence === 'high' ? 'stock' : result.confidence === 'medium' ? 'open' : 'drunk'} ms-auto`}>
                  {result.confidence === 'high' ? 'Confiance élevée' : result.confidence === 'medium' ? 'Confiance moyenne' : 'Confiance faible'}
                </span>
              </div>
              <div className="card-body">
                <div className="row g-2 mb-3">
                  {[
                    ['Nom', result.name], ['Appellation', result.appellation], ['Millésime', result.vintage],
                    ['Type', result.type], ['Producteur', result.producer], ['Région', result.region],
                    ['Pays', result.country], ['Cépages', result.grapes],
                  ].filter(([, v]) => v).map(([label, value]) => (
                    <div className="col-6" key={label}>
                      <div style={{ fontSize:'0.65rem', letterSpacing:2, color:'var(--cv-text3)', textTransform:'uppercase' }}>{label}</div>
                      <div style={{ fontSize:'0.9rem', color:'var(--cv-text)', fontFamily: label === 'Nom' ? 'Cormorant Garamond,serif' : undefined, fontWeight: label === 'Nom' ? 600 : 400 }}>{value}</div>
                    </div>
                  ))}
                </div>
                {result.notes && <div style={{ fontSize:'0.82rem', color:'var(--cv-text2)', fontStyle:'italic', borderTop:'0.5px solid var(--cv-border)', paddingTop:'0.75rem' }}>{result.notes}</div>}
                <div className="d-flex gap-2 mt-3">
                  <button className="btn btn-gold flex-grow-1" onClick={addToWine} disabled={addMutation.isPending}>
                    {addMutation.isPending ? <span className="spinner-border spinner-border-sm me-1" /> : <i className="bi bi-plus-circle me-1"></i>}
                    Ajouter à la cave
                  </button>
                  <button className="btn btn-outline-gold" onClick={() => { setResult(null); setPreview(null); }}>
                    <i className="bi bi-arrow-repeat"></i>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Tips */}
        <div className="col-12 col-lg-4">
          <div className="card">
            <div className="card-header"><h6 className="card-title">Conseils de scan</h6></div>
            <div className="card-body">
              {[
                { icon: 'bi-lightbulb', text: 'Bonne lumière naturelle pour de meilleurs résultats' },
                { icon: 'bi-zoom-in', text: 'Remplissez le cadre avec l\'étiquette principale' },
                { icon: 'bi-image', text: 'Formats acceptés : JPG, PNG, WEBP, HEIC' },
                { icon: 'bi-phone', text: 'Sur mobile, utilisez la caméra arrière' },
                { icon: 'bi-pencil', text: 'Vous pourrez corriger les informations après l\'import' },
              ].map((tip, i) => (
                <div key={i} className="d-flex gap-2 mb-2" style={{ fontSize:'0.82rem' }}>
                  <i className={`bi ${tip.icon}`} style={{ color:'var(--cv-gold)', flexShrink:0, marginTop:2 }}></i>
                  <span style={{ color:'var(--cv-text2)' }}>{tip.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <canvas ref={canvasRef} style={{ display:'none' }} />
    </div>
  );
}
