// src/pages/Register.jsx
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', username: '', password: '', confirm: '' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirm) { toast.error('Les mots de passe ne correspondent pas'); return; }
    if (form.password.length < 8) { toast.error('Mot de passe trop court (8 caractères min.)'); return; }
    setLoading(true);
    try {
      await register(form.email, form.username, form.password);
      toast.success('Compte créé ! Bienvenue dans votre cave 🍷');
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erreur lors de la création du compte');
    } finally {
      setLoading(false);
    }
  };

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="text-center mb-4">
          <div className="auth-logo mb-1">Cave & Vigne</div>
          <p style={{ fontSize: '0.75rem', letterSpacing: 3, color: 'var(--cv-text3)', textTransform: 'uppercase' }}>Collection privée</p>
        </div>
        <h5 style={{ color: 'var(--cv-text2)', fontWeight: 400, marginBottom: '1.5rem', fontSize: '0.9rem' }}>Créer votre cave personnelle</h5>
        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label className="form-label">Nom d'utilisateur</label>
            <div className="input-group">
              <span className="input-group-text"><i className="bi bi-person"></i></span>
              <input type="text" className="form-control" placeholder="VinophileNormandie" required minLength={2} maxLength={50}
                value={form.username} onChange={set('username')} autoFocus />
            </div>
          </div>
          <div className="mb-3">
            <label className="form-label">Email</label>
            <div className="input-group">
              <span className="input-group-text"><i className="bi bi-envelope"></i></span>
              <input type="email" className="form-control" placeholder="vous@exemple.fr" required
                value={form.email} onChange={set('email')} />
            </div>
          </div>
          <div className="mb-3">
            <label className="form-label">Mot de passe <span style={{ color: 'var(--cv-text3)', textTransform: 'none', letterSpacing: 0 }}>(8 caractères min.)</span></label>
            <div className="input-group">
              <span className="input-group-text"><i className="bi bi-lock"></i></span>
              <input type="password" className="form-control" placeholder="••••••••" required minLength={8}
                value={form.password} onChange={set('password')} />
            </div>
          </div>
          <div className="mb-4">
            <label className="form-label">Confirmer le mot de passe</label>
            <div className="input-group">
              <span className="input-group-text"><i className="bi bi-lock-fill"></i></span>
              <input type="password" className="form-control" placeholder="••••••••" required
                value={form.confirm} onChange={set('confirm')}
                style={{ borderColor: form.confirm && form.confirm !== form.password ? '#dc3545' : '' }} />
            </div>
            {form.confirm && form.confirm !== form.password && (
              <div style={{ fontSize: '0.75rem', color: '#dc3545', marginTop: 4 }}>Les mots de passe ne correspondent pas</div>
            )}
          </div>
          <button type="submit" className="btn btn-gold w-100 py-2" disabled={loading || (form.confirm && form.confirm !== form.password)}>
            {loading ? <span className="spinner-border spinner-border-sm me-2" /> : <i className="bi bi-person-plus me-2"></i>}
            Créer mon compte
          </button>
        </form>
        <hr style={{ borderColor: 'var(--cv-border)', margin: '1.5rem 0' }} />
        <p className="text-center mb-0" style={{ fontSize: '0.82rem', color: 'var(--cv-text2)' }}>
          Déjà un compte ? <Link to="/login" style={{ color: 'var(--cv-gold)' }}>Se connecter</Link>
        </p>
      </div>
    </div>
  );
}
