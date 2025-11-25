import React from 'react';
import { Status } from '../types';
import { Circle, Clock, Loader2, CheckCircle2, XCircle } from 'lucide-react';

interface Props {
  status: Status;
}

export const StatusBadge: React.FC<Props> = ({ status }) => {
  switch (status) {
    case Status.IDLE:
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
          <Circle className="w-3 h-3 mr-1" /> Idle
        </span>
      );
    case Status.QUEUED:
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
          <Clock className="w-3 h-3 mr-1" /> Chờ
        </span>
      );
    case Status.RUNNING:
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
          <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Đang chạy
        </span>
      );
    case Status.COMPLETED:
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
          <CheckCircle2 className="w-3 h-3 mr-1" /> Hoàn tất
        </span>
      );
    case Status.FAILED:
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
          <XCircle className="w-3 h-3 mr-1" /> Lỗi
        </span>
      );
    default:
      return null;
  }
};