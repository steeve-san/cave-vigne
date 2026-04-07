// src/pages/ForgotPassword.jsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { authAPI } from '../services/api';
import toast from 'react-hot-toast';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await authAPI.forgotPassword(email);
      setSent(true);
    } catch {
      toast.error('Erreur réseau — réessayez');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="d-flex align-items-center justify-content-center" style={{ minHeight: '100vh', background: 'var(--cv-bg)' }}>
      <div style={{ width: '100%', maxWidth: 400, padding: '1.5rem' }}>
        <div className="text-center mb-4">
          <h1 className="font-serif" style={{ fontSize: '2.2rem', color: 'var(--cv-gold)' }}>Cave & Vigne</h1>
          <p style={{ color: 'var(--cv-text3)', fontSize: '0.85rem' }}>Réinitialisation du mot de passe</p>
        </div>

        <div className="card">
          <div className="card-body p-4">
            {sent ? (
              <div className="text-center">
                <i className="bi bi-envelope-check d-block mb-3" style={{ fontSize: '2.5rem', color: '#4CAF50' }}></i>
                <h6 style={{ color: 'var(--cv-text)' }}>Email envoyé</h6>
                <p style={{ fontSize: '0.85rem', color: 'var(--cv-text2)' }}>
                  Si un compte existe avec l'adresse <strong>{email}</strong>, vous recevrez un lien de réinitialisation valide 2 heures.
                </p>
                <Link to="/login" className="btn btn-outline-gold btn-sm mt-2">Retour à la connexion</Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <div className="mb-3">
                  <label className="form-label">Adresse email</label>
                  <input
                    type="email" required className="form-control"
                    placeholder="votre@email.com"
                    value={email} onChange={e => setEmail(e.target.value)}
                  />
                </div>
                <button type="submit" className="btn btn-gold w-100" disabled={loading || !email}>
                  {loading ? <span className="spinner-border spinner-border-sm me-2" /> : null}
                  Envoyer le lien
                </button>
                <div className="text-center mt-3">
                  <Link to="/login" style={{ fontSize: '0.82rem', color: 'var(--cv-text3)', textDecoration: 'none' }}>
                    ← Retour à la connexion
                  </Link>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
