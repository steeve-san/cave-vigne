// src/pages/ResetPassword.jsx
import { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { authAPI } from '../services/api';
import toast from 'react-hot-toast';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirm) return toast.error('Les mots de passe ne correspondent pas');
    if (password.length < 8) return toast.error('8 caractères minimum');
    setLoading(true);
    try {
      await authAPI.resetPassword(token, password);
      toast.success('Mot de passe modifié !');
      navigate('/login');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Token invalide ou expiré');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="d-flex align-items-center justify-content-center" style={{ minHeight: '100vh', background: 'var(--cv-bg)' }}>
        <div className="text-center p-4">
          <i className="bi bi-exclamation-triangle d-block mb-3" style={{ fontSize: '2rem', color: '#dc3545' }}></i>
          <p style={{ color: 'var(--cv-text2)' }}>Lien invalide.</p>
          <Link to="/forgot-password" className="btn btn-outline-gold btn-sm">Demander un nouveau lien</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="d-flex align-items-center justify-content-center" style={{ minHeight: '100vh', background: 'var(--cv-bg)' }}>
      <div style={{ width: '100%', maxWidth: 400, padding: '1.5rem' }}>
        <div className="text-center mb-4">
          <h1 className="font-serif" style={{ fontSize: '2.2rem', color: 'var(--cv-gold)' }}>Cave & Vigne</h1>
          <p style={{ color: 'var(--cv-text3)', fontSize: '0.85rem' }}>Nouveau mot de passe</p>
        </div>
        <div className="card">
          <div className="card-body p-4">
            <form onSubmit={handleSubmit}>
              <div className="mb-3">
                <label className="form-label">Nouveau mot de passe</label>
                <input type="password" required className="form-control" minLength={8}
                  placeholder="8 caractères minimum"
                  value={password} onChange={e => setPassword(e.target.value)} />
              </div>
              <div className="mb-3">
                <label className="form-label">Confirmer le mot de passe</label>
                <input type="password" required className="form-control"
                  placeholder="Répéter le mot de passe"
                  value={confirm} onChange={e => setConfirm(e.target.value)} />
              </div>
              <button type="submit" className="btn btn-gold w-100" disabled={loading || !password || !confirm}>
                {loading ? <span className="spinner-border spinner-border-sm me-2" /> : null}
                Modifier le mot de passe
              </button>
              <div className="text-center mt-3">
                <Link to="/login" style={{ fontSize: '0.82rem', color: 'var(--cv-text3)', textDecoration: 'none' }}>
                  ← Retour à la connexion
                </Link>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
