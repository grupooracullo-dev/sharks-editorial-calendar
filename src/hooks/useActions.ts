import { useState, useEffect } from 'react';
import { Action, ActionFilters } from '@/types';
import {
  getActions,
  subscribeToActions,
  reloadActions,
  getActionsLoadStatus,
  createAction,
  updateAction,
  deleteAction,
  getTodayActions,
  getWeekActions,
  getOverdueActions,
  getPendingActions,
} from '@/lib/actionService';

export type ActionsLoadStatus = 'idle' | 'loading' | 'success' | 'error';

export function useActions(filters?: ActionFilters) {
  const [actions, setActions] = useState<Action[]>(() => getActions(filters));
  const [loadStatus, setLoadStatus] = useState<ActionsLoadStatus>('idle');

  useEffect(() => {
    setActions(getActions(filters));
    setLoadStatus(getActionsLoadStatus());

    const unsubscribe = subscribeToActions(() => {
      setActions(getActions(filters));
      setLoadStatus(getActionsLoadStatus());
    });

    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filters)]);

  const refresh = () => reloadActions();

  return {
    actions,
    loadStatus,
    create: createAction,
    update: updateAction,
    remove: deleteAction,
    refresh,
  };
}

export function useTodayActions(workspaceId?: string) {
  const [actions, setActions] = useState<Action[]>([]);

  useEffect(() => {
    const update = () => setActions(getTodayActions(workspaceId));
    update();
    const unsubscribe = subscribeToActions(update);
    return unsubscribe;
  }, [workspaceId]);

  return actions;
}

export function useWeekActions(startDate: string, endDate: string, workspaceId?: string) {
  const [actions, setActions] = useState<Action[]>([]);

  useEffect(() => {
    const update = () => setActions(getWeekActions(startDate, endDate, workspaceId));
    update();
    const unsubscribe = subscribeToActions(update);
    return unsubscribe;
  }, [startDate, endDate, workspaceId]);

  return actions;
}

export function useOverdueActions(workspaceId?: string) {
  const [actions, setActions] = useState<Action[]>([]);

  useEffect(() => {
    const update = () => setActions(getOverdueActions(workspaceId));
    update();
    const unsubscribe = subscribeToActions(update);
    return unsubscribe;
  }, [workspaceId]);

  return actions;
}

export function usePendingActions(workspaceId?: string) {
  const [actions, setActions] = useState<Action[]>([]);

  useEffect(() => {
    const update = () => setActions(getPendingActions(workspaceId));
    update();
    const unsubscribe = subscribeToActions(update);
    return unsubscribe;
  }, [workspaceId]);

  return actions;
}
