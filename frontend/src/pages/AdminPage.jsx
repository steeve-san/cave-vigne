// src/pages/AdminPage.jsx
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminAPI } from '../services/api';
import { useLang } from '../context/LangContext';
import toast from 'react-hot-toast';

const ROLES = ['visiteur', 'user', 'admin'];

function RoleBadge({ role, t }) {
  const cls = { visiteur: 'badge-role-visiteur', user: 'badge-role-user', admin: 'badge-role-admin' };
  return (
    <span className={`badge-type ${cls[role] || ''}`} style={{ fontSize: '0.7rem', padding: '2px 8px' }}>
      {t(`admin.roles.${role}`)}
    </span>
  );
}

export default function AdminPage() {
  const { t } = useLang();
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [form, setForm] = useState({ email: '', username: '', password: '', role: 'user' });

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => adminAPI.listUsers().then(r => r.data),
  });

  const createMut = useMutation({
    mutationFn: (data) => adminAPI.createUser(data),
    onSuccess: () => {
      qc.invalidateQueries(['admin-users']);
      toast.success('Utilisateur créé');
      setShowModal(false);
      setForm({ email: '', username: '', password: '', role: 'user' });
    },
    onError: (e) => toast.error(e.response?.data?.error || t('common.error')),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => adminAPI.updateUser(id, data),
    onSuccess: () => { qc.invalidateQueries(['admin-users']); toast.success('Modifié'); setEditUser(null); },
    onError: (e) => toast.error(e.response?.data?.error || t('common.error')),
  });

  const toggleActive = (user) =>
    updateMut.mutate({ id: user.id, data: { is_active: !user.is_active } });

  const changeRole = (user, role) =>
    updateMut.mutate({ id: user.id, data: { role } });

  const handleCreate = (e) => {
    e.preventDefault();
    if (form.password.length < 8) return toast.error(t('auth.passwordTooShort'));
    createMut.mutate(form);
  };

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString() : '—';

  return (
    <div className="fade-in">
      <div className="d-flex align-items-center justify-content-between mb-4">
        <h2 className="font-serif mb-0" style={{ color: 'var(--cv-gold)', fontSize: '1.6rem' }}>
          {t('admin.title')}
        </h2>
        <button className="btn btn-wine btn-sm" onClick={() => setShowModal(true)}>
          <i className="bi bi-person-plus me-1"></i>{t('admin.createUser')}
        </button>
      </div>

      {/* Stats rapides */}
      <div className="row g-3 mb-4">
        {ROLES.map(role => {
          const count = users.filter(u => u.role === role).length;
          return (
            <div key={role} className="col-4">
              <div className="stat-card text-center">
                <div className="stat-num">{count}</div>
                <div className="stat-label">{t(`admin.roles.${role}`)}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Table utilisateurs */}
      <div className="card">
        <div className="card-header d-flex align-items-center justify-content-between">
          <span className="card-title">{t('admin.users')}</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--cv-text3)' }}>{users.length} total</span>
        </div>
        <div className="card-body p-0">
          {isLoading ? (
            <div className="text-center py-5"><div className="spinner-border" style={{ color: 'var(--cv-gold)' }} /></div>
          ) : (
            <div className="table-responsive">
              <table className="table mb-0">
                <thead>
                  <tr>
                    <th>{t('common.name')}</th>
                    <th>Email</th>
                    <th>{t('admin.role')}</th>
                    <th>{t('admin.status')}</th>
                    <th>{t('admin.lastLogin')}</th>
                    <th>{t('admin.createdAt')}</th>
                    <th>{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id}>
                      <td>
                        <div style={{ fontWeight: 500 }}>{u.username}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--cv-text3)' }}>#{u.id}</div>
                      </td>
                      <td style={{ fontSize: '0.82rem' }}>{u.email}</td>
                      <td>
                        {editUser?.id === u.id ? (
                          <select
                            className="form-select form-select-sm"
                            style={{ width: 120 }}
                            value={editUser.role}
                            onChange={e => setEditUser({ ...editUser, role: e.target.value })}
                          >
                            {ROLES.map(r => <option key={r} value={r}>{t(`admin.roles.${r}`)}</option>)}
                          </select>
                        ) : (
                          <RoleBadge role={u.role} t={t} />
                        )}
                      </td>
                      <td>
                        <span className={u.is_active ? 'badge-stock' : 'badge-drunk'}>
                          {u.is_active ? t('admin.active') : t('admin.inactive')}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--cv-text2)' }}>{fmtDate(u.last_login)}</td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--cv-text2)' }}>{fmtDate(u.created_at)}</td>
                      <td>
                        <div className="d-flex gap-1">
                          {editUser?.id === u.id ? (
                            <>
                              <button className="btn btn-gold btn-sm px-2"
                                onClick={() => changeRole(u, editUser.role)}
                                disabled={updateMut.isPending}
                              >
                                <i className="bi bi-check"></i>
                              </button>
                              <button className="btn btn-outline-gold btn-sm px-2" onClick={() => setEditUser(null)}>
                                <i className="bi bi-x"></i>
                              </button>
                            </>
                          ) : (
                            <>
                              <button className="btn btn-outline-gold btn-sm px-2"
                                onClick={() => setEditUser({ ...u })}
                                title={t('admin.editUser')}
                              >
                                <i className="bi bi-pencil"></i>
                              </button>
                              <button
                                className={`btn btn-sm px-2 ${u.is_active ? 'btn-outline-danger' : 'btn-outline-success'}`}
                                style={{ borderRadius: 8 }}
                                onClick={() => {
                                  if (window.confirm(t('admin.confirmDeactivate'))) toggleActive(u);
                                }}
                                title={u.is_active ? t('admin.deactivate') : t('admin.activate')}
                                disabled={updateMut.isPending}
                              >
                                <i className={`bi ${u.is_active ? 'bi-person-x' : 'bi-person-check'}`}></i>
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Descriptions des rôles */}
      <div className="row g-3 mt-2">
        {ROLES.map(role => (
          <div key={role} className="col-md-4">
            <div className="stat-card">
              <div className="d-flex align-items-center gap-2 mb-1">
                <RoleBadge role={role} t={t} />
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--cv-text2)', margin: 0 }}>
                {t(`admin.roleDesc.${role}`)}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Modal création utilisateur */}
      {showModal && (
        <div className="modal show d-block" style={{ background: 'var(--cv-modal-overlay)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">{t('admin.createUser')}</h5>
                <button className="btn-close" onClick={() => setShowModal(false)}></button>
              </div>
              <form onSubmit={handleCreate}>
                <div className="modal-body d-flex flex-column gap-3">
                  <div>
                    <label className="form-label">{t('auth.email')}</label>
                    <input className="form-control" type="email" required
                      value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                  </div>
                  <div>
                    <label className="form-label">{t('auth.username')}</label>
                    <input className="form-control" required minLength={2}
                      value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} />
                  </div>
                  <div>
                    <label className="form-label">{t('auth.password')}</label>
                    <input className="form-control" type="password" required minLength={8}
                      value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
                  </div>
                  <div>
                    <label className="form-label">{t('admin.role')}</label>
                    <select className="form-select"
                      value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                      {ROLES.map(r => (
                        <option key={r} value={r}>{t(`admin.roles.${r}`)} — {t(`admin.roleDesc.${r}`)}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-outline-gold btn-sm" onClick={() => setShowModal(false)}>
                    {t('common.cancel')}
                  </button>
                  <button type="submit" className="btn btn-wine btn-sm" disabled={createMut.isPending}>
                    {createMut.isPending ? <span className="spinner-border spinner-border-sm me-1" /> : null}
                    {t('admin.createUser')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
