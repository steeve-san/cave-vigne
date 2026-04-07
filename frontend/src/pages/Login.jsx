// src/pages/Login.jsx
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(form.email, form.password);
      toast.success('Bienvenue !');
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Identifiants invalides');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="text-center mb-4">
          <div className="auth-logo mb-1">Cave & Vigne</div>
          <p style={{ fontSize: '0.75rem', letterSpacing: 3, color: 'var(--cv-text3)', textTransform: 'uppercase' }}>Collection privée</p>
        </div>
        <h5 style={{ color: 'var(--cv-text2)', fontWeight: 400, marginBottom: '1.5rem', fontSize: '0.9rem' }}>Connectez-vous à votre cave</h5>
        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label className="form-label">Email</label>
            <div className="input-group">
              <span className="input-group-text"><i className="bi bi-envelope"></i></span>
              <input type="email" className="form-control" placeholder="vous@exemple.fr" required
                value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} autoFocus />
            </div>
          </div>
          <div className="mb-4">
            <div className="d-flex justify-content-between align-items-center mb-1">
              <label className="form-label mb-0">Mot de passe</label>
              <Link to="/forgot-password" style={{ fontSize: '0.75rem', color: 'var(--cv-text3)', textDecoration: 'none' }}>Mot de passe oublié ?</Link>
            </div>
            <div className="input-group">
              <span className="input-group-text"><i className="bi bi-lock"></i></span>
              <input type={showPwd ? 'text' : 'password'} className="form-control" placeholder="••••••••" required
                value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
              <button type="button" className="input-group-text" style={{ cursor: 'pointer' }} onClick={() => setShowPwd(v => !v)}>
                <i className={`bi bi-eye${showPwd ? '-slash' : ''}`}></i>
              </button>
            </div>
          </div>
          <button type="submit" className="btn btn-gold w-100 py-2" disabled={loading}>
            {loading ? <span className="spinner-border spinner-border-sm me-2" /> : <i className="bi bi-box-arrow-in-right me-2"></i>}
            Se connecter
          </button>
        </form>
        <hr style={{ borderColor: 'var(--cv-border)', margin: '1.5rem 0' }} />
        <p className="text-center mb-0" style={{ fontSize: '0.82rem', color: 'var(--cv-text2)' }}>
          Pas encore de compte ?{' '}
          <Link to="/register" style={{ color: 'var(--cv-gold)' }}>Créer un compte</Link>
        </p>
      </div>
    </div>
  );
}
