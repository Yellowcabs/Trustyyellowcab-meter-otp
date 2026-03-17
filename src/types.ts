export interface Location {
  lat: number;
  lng: number;
  timestamp: number;
}

export type TripStatus = 'IDLE' | 'ACTIVE' | 'WAITING' | 'COMPLETED';

export interface FareSettings {
  baseFare: number;
  pricePerKm: number;
  waitingChargePerMin: number;
  driverName: string;
  vehicleNumber: string;
}

export interface TripData {
  id: string;
  startTime: number;
  endTime: number;
  distance: number;
  duration: number;
  waitingTime: number;
  totalFare: number;
  route: Location[];
  fareSettings: FareSettings;
}
