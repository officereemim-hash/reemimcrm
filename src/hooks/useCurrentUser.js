import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

let cachedUser = null;

export function useCurrentUser() {
  const [user, setUser] = useState(cachedUser);
  const [loading, setLoading] = useState(!cachedUser);

  useEffect(() => {
    if (cachedUser) return;
    base44.auth.me().then(u => {
      cachedUser = u;
      setUser(u);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const isAdmin = user?.role === 'admin';
  const isStaff = user?.role === 'user' || user?.role === 'staff';
  const currentUserName = user?.full_name?.split(' ')[0]?.toLowerCase() || '';

  // Staff can only see records assigned to them
  const filterForUser = (records, assignedField = 'assigned_to') => {
    if (isAdmin) return records;
    return records.filter(r => {
      const assigned = r[assignedField];
      if (!assigned) return false;
      return assigned.toLowerCase() === currentUserName ||
        assigned.toLowerCase().includes(currentUserName);
    });
  };

  return { user, loading, isAdmin, isStaff, filterForUser };
}