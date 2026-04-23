import { AxiosInstance } from 'axios';
import { LuckyWheelTicket, LuckyWheelDrawResult, LuckyWheelDraw } from '@/types';

export function createLuckyWheelMethods(http: AxiosInstance) {
  return {
    async getLuckyWheelAvailableDraws(): Promise<LuckyWheelTicket[]> {
      const { data } = await http.get('/lucky-wheel/client/available-draws');
      return data;
    },
    async triggerLuckyWheelDraw(ticketId: string): Promise<LuckyWheelDrawResult> {
      const { data } = await http.post('/lucky-wheel/client/trigger-draw', { ticketId });
      return data;
    },
    async getLuckyWheelHistory(): Promise<LuckyWheelDraw[]> {
      const { data } = await http.get('/lucky-wheel/client/history');
      return data;
    },
  };
}
