// Helper for Google Workspace authentication and session persistence

const AUTH_STORAGE_KEY = 'isf_auth_user_v1';
const GOOGLE_CLIENT_ID = '87735189447-e17o4u1u2f354f05k98418g53i4g0fsm.apps.googleusercontent.com'; // Google OAuth client

export interface AuthState {
  isAuthenticated: boolean;
  user: {
    email: string;
    name: string;
    picture?: string;
    role: 'admin' | 'user';
    accessToken?: string;
  } | null;
}

export function getStoredAuth(): AuthState {
  try {
    const saved = localStorage.getItem(AUTH_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && parsed.email && parsed.name) {
        return {
          isAuthenticated: true,
          user: {
            email: parsed.email.trim().toLowerCase(),
            name: parsed.name.trim(),
            picture: parsed.picture || undefined,
            role: parsed.role || (parsed.email.includes('admin') || parsed.email.startsWith('alevy') ? 'admin' : 'user'),
            accessToken: parsed.accessToken || undefined,
          },
        };
      }
    }
  } catch (e) {
    console.warn('Error reading auth state from localStorage:', e);
  }

  // Not authenticated if no user is saved in this browser
  return {
    isAuthenticated: false,
    user: null,
  };
}

export function saveStoredAuth(user: { email: string; name: string; picture?: string; role: 'admin' | 'user'; accessToken?: string } | null) {
  if (user) {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  }
}

export function getStoredUserBankDetails(email: string) {
  try {
    const saved = localStorage.getItem(`isf_bank_details_${email}`);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.warn('Error reading bank details:', e);
  }
  return null;
}

export function saveStoredUserBankDetails(email: string, details: any) {
  try {
    localStorage.setItem(`isf_bank_details_${email}`, JSON.stringify(details));
  } catch (e) {
    console.warn('Error saving bank details:', e);
  }
}

// User project history to auto-suggest the most frequently used project
export function getSuggestedProject(userEmail: string, expenses: any[], availableProjects: string[]): string {
  if (!availableProjects || availableProjects.length === 0) return 'General';
  
  // Look at user's past expenses
  const userExpenses = expenses.filter((e) => e.submittedByEmail === userEmail || !e.submittedByEmail);
  if (userExpenses.length === 0) return availableProjects[0];

  const projectCounts: Record<string, number> = {};
  userExpenses.forEach((e) => {
    if (e.project && availableProjects.includes(e.project)) {
      projectCounts[e.project] = (projectCounts[e.project] || 0) + 1;
    }
  });

  let topProject = availableProjects[0];
  let maxCount = -1;
  for (const [proj, count] of Object.entries(projectCounts)) {
    if (count > maxCount) {
      maxCount = count;
      topProject = proj;
    }
  }

  return topProject;
}
