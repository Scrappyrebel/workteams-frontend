"use client";

import { createContext, useContext } from "react";

export const CompanyContext = createContext({ company: null, member: null, loading: true });

export function useCompany() {
  return useContext(CompanyContext);
}
