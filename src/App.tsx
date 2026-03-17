/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Play, 
  Square, 
  RotateCcw, 
  Clock, 
  MapPin, 
  Navigation, 
  Settings as SettingsIcon,
  History as HistoryIcon,
  X,
  FileText,
  Volume2,
  Lock,
  Key,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { TripStatus, TripData, FareSettings } from './types';
import { formatDuration, formatCurrency, cn } from './utils';
import { useGeolocation } from './hooks/useGeolocation';
import { SoundService } from './services/soundService';
import { backgroundService } from './services/backgroundService';

const WAITING_CHARGE_PER_MIN = 0.5;

const DEFAULT_SETTINGS: FareSettings = {
  baseFare: 80,
  pricePerKm: 25,
  waitingChargePerMin: WAITING_CHARGE_PER_MIN,
  driverName: '',
  vehicleNumber: '',
};

const SETTINGS_KEY = 'taxi_meter_settings';
const TRIP_STATE_KEY = 'taxi_meter_active_trip';

export default function App() {
  const [status, setStatus] = useState<TripStatus>('IDLE');
  const [tripTime, setTripTime] = useState(0);
  const [waitingTime, setWaitingTime] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [lastTrip, setLastTrip] = useState<TripData | null>(null);
  const [persistedDistance, setPersistedDistance] = useState(0);
  const wakeLockRef = useRef<any>(null);

  // Access Code Logic
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [inputCode, setInputCode] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  const handleAuth = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    if (inputCode.length !== 4) {
      setAuthError('Please enter a 4-digit code');
      return;
    }

    try {
      const response = await fetch('/api/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: inputCode }),
      });
      const data = await response.json();

      if (!data.success) {
        setAuthError(data.message || 'Invalid or used code');
        setInputCode('');
        return;
      }

      // Success
      setIsAuthorized(true);
      setAuthError(null);
    } catch (err) {
      setAuthError('Server error. Please try again.');
    }
  };

  // Fare Configuration
  const [settings, setSettings] = useState<FareSettings>(() => {
    const saved = localStorage.getItem(SETTINGS_KEY);
    return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
  });

  // Persist settings
  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  // Wake Lock Logic
  const requestWakeLock = async () => {
    if ('wakeLock' in navigator) {
      try {
        // Release existing one if any
        if (wakeLockRef.current) {
          await wakeLockRef.current.release();
        }
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        console.log('Wake Lock acquired');
        
        // Re-request if it's released due to visibility change
        wakeLockRef.current.addEventListener('release', () => {
          console.log('Wake Lock released');
          if (document.visibilityState === 'visible' && (status === 'ACTIVE' || status === 'WAITING')) {
            requestWakeLock();
          }
        });
      } catch (err) {
        console.error('Wake Lock error:', err);
      }
    }
  };

  const releaseWakeLock = () => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release();
      wakeLockRef.current = null;
    }
  };

  // Trip Persistence & Recovery
  useEffect(() => {
    const savedTrip = localStorage.getItem(TRIP_STATE_KEY);
    if (savedTrip) {
      const data = JSON.parse(savedTrip);
      if (data.status === 'ACTIVE' || data.status === 'WAITING') {
        const now = Date.now();
        const elapsedSeconds = Math.floor((now - data.lastUpdated) / 1000);
        
        setStatus(data.status);
        setTripTime(data.tripTime + elapsedSeconds);
        setWaitingTime(data.waitingTime + (data.status === 'WAITING' ? elapsedSeconds : 0));
        setPersistedDistance(data.distance);
        setIsAuthorized(true); // Persist authorization for active trips
        requestWakeLock();
        backgroundService.start();
      }
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tType = params.get('t') || '1';
    
    // Only apply URL params if no saved settings exist or if explicitly requested
    if (!localStorage.getItem(SETTINGS_KEY)) {
      if (tType === '2') setSettings(prev => ({ ...prev, baseFare: 100, pricePerKm: 25 }));
      else if (tType === '3') setSettings(prev => ({ ...prev, baseFare: 80, pricePerKm: 27 }));
      else setSettings(prev => ({ ...prev, baseFare: 80, pricePerKm: 25 }));
    }
  }, []);

  const brand = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('brand') || 'get';
  }, []);

  const { currentLocation, distance, speed, route, resetDistance } = useGeolocation(status === 'ACTIVE' || status === 'WAITING', persistedDistance);

  useEffect(() => {
    if (status === 'ACTIVE' || status === 'WAITING') {
      const interval = setInterval(() => {
        localStorage.setItem(TRIP_STATE_KEY, JSON.stringify({
          status,
          tripTime,
          waitingTime,
          distance,
          lastUpdated: Date.now()
        }));
      }, 2000);
      return () => clearInterval(interval);
    } else if (status === 'IDLE' || status === 'COMPLETED') {
      localStorage.removeItem(TRIP_STATE_KEY);
    }
  }, [status, tripTime, waitingTime, distance]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && (status === 'ACTIVE' || status === 'WAITING')) {
        localStorage.setItem(TRIP_STATE_KEY, JSON.stringify({
          status,
          tripTime,
          waitingTime,
          distance,
          lastUpdated: Date.now()
        }));
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [status, tripTime, waitingTime, distance]);

  const totalFare = useMemo(() => {
    if (status === 'IDLE') return 0;
    const distanceFare = distance * settings.pricePerKm;
    const waitingFare = (waitingTime / 60) * WAITING_CHARGE_PER_MIN;
    return settings.baseFare + distanceFare + waitingFare;
  }, [distance, waitingTime, settings, status]);

  const lastTickRef = useRef<number>(Date.now());

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (status === 'ACTIVE' || status === 'WAITING') {
      lastTickRef.current = Date.now();
      interval = setInterval(() => {
        const now = Date.now();
        const delta = Math.floor((now - lastTickRef.current) / 1000);
        
        if (delta >= 1) {
          setTripTime((prev) => prev + delta);
          
          // Waiting logic: speed < 0.3 m/s (approx 1 km/h)
          if (speed < 0.3) {
            setStatus('WAITING');
            setWaitingTime((prev) => prev + delta);
          } else {
            setStatus('ACTIVE');
          }
          lastTickRef.current = now;
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [status, speed]);

  // Catch up logic when returning from background
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && (status === 'ACTIVE' || status === 'WAITING')) {
        // Re-request wake lock as it might have been released
        requestWakeLock();

        const now = Date.now();
        const delta = Math.floor((now - lastTickRef.current) / 1000);
        if (delta > 0) {
          setTripTime((prev) => prev + delta);
          if (status === 'WAITING') {
            setWaitingTime((prev) => prev + delta);
          }
          lastTickRef.current = now;
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [status]);

  const startTrip = () => {
    if (status !== 'IDLE') return;
    SoundService.playStart();
    backgroundService.start();
    setStatus('ACTIVE');
    setTripTime(0);
    setWaitingTime(0);
    setPersistedDistance(0);
    resetDistance();
    requestWakeLock();
  };

  const stopTrip = () => {
    if (status === 'IDLE' || status === 'COMPLETED') return;
    SoundService.playStop(totalFare);
    backgroundService.stop();
    releaseWakeLock();
    const trip: TripData = {
      id: Date.now().toString(),
      startTime: Date.now() - tripTime * 1000,
      endTime: Date.now(),
      distance,
      duration: tripTime,
      waitingTime,
      totalFare,
      route,
      fareSettings: settings,
    };
    setLastTrip(trip);
    setStatus('COMPLETED');
  };

  const resetTrip = () => {
    SoundService.playTick();
    backgroundService.stop();
    setStatus('IDLE');
    setTripTime(0);
    setWaitingTime(0);
    setLastTrip(null);
    setPersistedDistance(0);
    resetDistance();
    releaseWakeLock();
    setIsAuthorized(false); // Require new code for next trip
    setInputCode('');
  };

  const shareTripDetails = () => {
    if (!lastTrip) return;
    const driverInfo = lastTrip.fareSettings.driverName ? `%0A*Driver:* ${lastTrip.fareSettings.driverName}` : '';
    const vehicleInfo = lastTrip.fareSettings.vehicleNumber ? `%0A*Vehicle:* ${lastTrip.fareSettings.vehicleNumber}` : '';
    const msg = `*TRIP DETAILS - COMPLETED*%0A--------------------------${driverInfo}${vehicleInfo}%0A*Pickup:* ${new Date(lastTrip.startTime).toLocaleTimeString()}%0A*Drop:* ${new Date(lastTrip.endTime!).toLocaleTimeString()}%0A--------------------------%0A*KM Travelled:* ${lastTrip.distance.toFixed(2)} KM%0A*Wait Timing:* ${formatDuration(lastTrip.waitingTime)}%0A--------------------------%0A*TOTAL BILL: ₹${lastTrip.totalFare.toFixed(2)}*`;
    window.open(`https://wa.me/918667726577?text=${msg}`, '_blank');
  };

  const fareParts = totalFare.toFixed(2).split('.');

  return (
    <div className="fixed inset-0 bg-[#F9FAFB] text-[#111827] font-sans flex flex-col overflow-hidden safe-top safe-bottom">
      {/* Header */}
      <header className="w-full bg-white border-b border-[#F1F3F5] px-6 z-50 shrink-0 pt-[env(safe-area-inset-top)] shadow-sm">
        <div className="h-16 flex items-center justify-center max-w-4xl mx-auto w-full">
          <h1 className="font-black text-xl sm:text-2xl tracking-[0.05em] uppercase text-[#ef4444] flex items-center gap-2">
            <div className="w-2 h-6 bg-[#ef4444] rounded-full" />
            TrustyYellowCabs
          </h1>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto w-full max-w-md md:max-w-2xl lg:max-w-4xl mx-auto px-4 pt-6 pb-40 scroll-smooth">
        {!isAuthorized && status === 'IDLE' ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8">
         
            
            <div className="text-center space-y-2">
              <h2 className="text-3xl font-black uppercase tracking-tight">Enter Otp</h2>
              <p className="text-[#9CA3AF] text-sm font-bold uppercase tracking-widest">Enter 4-digit Otp to start</p>
            </div>

            <form onSubmit={handleAuth} className="w-full max-w-xs space-y-6">
              <div className="relative">
                <input 
                  type="text" 
                  inputMode="numeric"
                  maxLength={4}
                  value={inputCode}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    if (val.length <= 4) setInputCode(val);
                    if (authError) setAuthError(null);
                  }}
                  placeholder="0 0 0 0"
                  className={cn(
                    "w-full bg-white border-2 rounded-3xl py-6 text-center text-5xl font-black tracking-[0.5em] outline-none transition-all",
                    authError ? "border-red-500 text-red-500" : "border-[#F1F3F5] focus:border-[#ef4444]"
                  )}
                />
                {authError && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute -bottom-8 left-0 right-0 text-center text-red-500 text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1"
                  >
                    <AlertCircle className="w-3 h-3" />
                    {authError}
                  </motion.div>
                )}
              </div>

              <button 
                type="submit"
                disabled={inputCode.length !== 4}
                className={cn(
                  "w-full py-6 rounded-[24px] text-white font-black text-xl uppercase tracking-widest shadow-xl transition-all active:scale-95",
                  inputCode.length === 4 ? "bg-[#ef4444]" : "bg-[#9CA3AF] cursor-not-allowed opacity-50"
                )}
              >
                Verify & Start
              </button>
            </form>

            <div className="pt-8 text-center">
              {/* Available codes counter removed by user */}
            </div>
          </div>
        ) : status !== 'COMPLETED' ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {/* Live Meter Card */}
            <div className="w-full bg-white rounded-[40px] p-8 sm:p-10 text-center shadow-sm border border-[#F1F3F5]">
              {/* Background Mode Indicator */}
              {(status === 'ACTIVE' || status === 'WAITING') && (
                <div className="flex flex-col gap-2 mb-6">
             
                </div>
              )}
              <div className="text-[#9CA3AF] text-[12px] font-black tracking-[2px] uppercase mb-3">Live Fare</div>
              <div className="flex items-center justify-center gap-1 mb-8">
                <span className="text-[#ef4444] text-4xl font-black mt-2">₹</span>
                <span className="text-8xl sm:text-9xl font-black tracking-tighter tabular-nums leading-none">{fareParts[0]}</span>
                <span className="text-4xl sm:text-5xl text-[#9CA3AF] font-black mt-auto mb-2">.{fareParts[1]}</span>
              </div>
              
              <div className="grid grid-cols-2 gap-4 pt-10 border-t border-[#F3F4F6]">
                <div>
                  <div className="text-[#9CA3AF] text-[10px] font-black tracking-[2px] uppercase mb-2">Distance</div>
                  <div className="text-4xl font-black tracking-tighter">
                    {distance.toFixed(2)}<span className="text-xs font-black text-[#9CA3AF] ml-1 uppercase">km</span>
                  </div>
                </div>
                <div>
                  <div className="text-[#9CA3AF] text-[10px] font-black tracking-[2px] uppercase mb-2">Waiting</div>
                  <div className="text-4xl font-black tracking-tighter">
                    {formatDuration(waitingTime).substring(3)}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-4 w-full">
                <div className="bg-white rounded-[28px] p-6 text-center shadow-sm border border-[#F1F3F5]">
                  <div className="text-[#9CA3AF] text-[10px] font-black tracking-[2px] uppercase mb-2">Speed</div>
                  <div className="text-4xl font-black tracking-tighter">
                    {(speed * 3.6).toFixed(1)}<span className="text-[10px] font-black text-[#9CA3AF] ml-1 uppercase">km/h</span>
                  </div>
                </div>
                <div className="bg-white rounded-[28px] p-6 text-center shadow-sm border border-[#F1F3F5]">
                  <div className="text-[#9CA3AF] text-[10px] font-black tracking-[2px] uppercase mb-2">Status</div>
                  <div className={cn("text-xl font-black uppercase tracking-tighter", status === 'ACTIVE' ? "text-[#1E3A8A]" : "text-[#ef4444]")}>
                    {status === 'WAITING' ? 'Waiting' : 'Driving'}
                  </div>
                </div>
              </div>

              {/* Trip Info Card (Desktop only or extra info) */}
              <div className="hidden lg:block bg-white rounded-[28px] p-6 shadow-sm border border-[#F1F3F5]">
                <div className="text-[#9CA3AF] text-[10px] font-black tracking-[2px] uppercase mb-4">Trip Progress</div>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-[#4B5563]">Duration</span>
                    <span className="text-lg font-black tabular-nums">{formatDuration(tripTime)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-[#4B5563]">Base Fare</span>
                    <span className="text-lg font-black">₹{settings.baseFare}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Button */}
            <div className="fixed bottom-0 left-0 right-0 p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] bg-gradient-to-t from-[#F9FAFB] via-[#F9FAFB] to-transparent z-40">
              <div className="max-w-md md:max-w-lg mx-auto">
                <button 
                  onClick={status === 'IDLE' ? startTrip : stopTrip}
                  className={cn(
                    "w-full py-6 rounded-[24px] text-white font-black text-xl uppercase tracking-widest shadow-xl transition-all active:scale-95",
                    status === 'IDLE' ? "bg-[#ef4444]" : "bg-[#111827]"
                  )}
                >
                  {status === 'IDLE' ? 'Start Trip' : 'Stop Trip'}
                </button>
              </div>
            </div>
          </div>
        ) : lastTrip && (
          /* Receipt View - Compact & Easy to Use */
          <div className="w-full flex flex-col items-center pb-10 max-w-md mx-auto">
            <div className="w-full bg-white p-6 rounded-[32px] border-2 border-dashed border-[#D1D5DB] mb-6 shadow-sm">
              <h2 className="text-center font-black text-2xl mb-6 tracking-tighter uppercase text-[#ef4444]">Trip Receipt</h2>
              
              {/* Driver & Vehicle Info */}
              {(lastTrip!.fareSettings.driverName || lastTrip!.fareSettings.vehicleNumber) && (
                <div className="mb-6 p-4 bg-[#F9FAFB] rounded-2xl border border-[#F1F3F5] text-center">
                  {lastTrip!.fareSettings.driverName && (
                    <div className="text-lg font-black uppercase tracking-tight text-[#111827]">
                      {lastTrip!.fareSettings.driverName}
                    </div>
                  )}
                  {lastTrip!.fareSettings.vehicleNumber && (
                    <div className="text-xs font-bold text-[#9CA3AF] uppercase tracking-widest mt-1">
                      {lastTrip!.fareSettings.vehicleNumber}
                    </div>
                  )}
                </div>
              )}
              
              <div className="space-y-3 text-[#4B5563] font-black">
                {/* Compact Stats Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-[#F9FAFB] p-3 rounded-xl border border-[#F1F3F5]">
                    <div className="text-[9px] uppercase tracking-widest text-[#9CA3AF] mb-0.5">Distance</div>
                    <div className="text-xl tracking-tighter">{lastTrip!.distance.toFixed(2)} km</div>
                  </div>
                  <div className="bg-[#F9FAFB] p-3 rounded-xl border border-[#F1F3F5]">
                    <div className="text-[9px] uppercase tracking-widest text-[#9CA3AF] mb-0.5">Waiting</div>
                    <div className="text-xl tracking-tighter">{formatDuration(lastTrip!.waitingTime).substring(3)}</div>
                  </div>
                </div>

                {/* Times Row */}
                <div className="flex gap-3">
                  <div className="flex-1 bg-[#F9FAFB] p-3 rounded-xl border border-[#F1F3F5] flex justify-between items-center">
                    <span className="text-[9px] uppercase tracking-widest text-[#9CA3AF]">Start</span>
                    <span className="text-sm">{new Date(lastTrip!.startTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                  </div>
                  <div className="flex-1 bg-[#F9FAFB] p-3 rounded-xl border border-[#F1F3F5] flex justify-between items-center">
                    <span className="text-[9px] uppercase tracking-widest text-[#9CA3AF]">End</span>
                    <span className="text-sm">{new Date(lastTrip!.endTime!).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                  </div>
                </div>

                {/* Total Fare - Prominent */}
                <div className="flex justify-between items-center text-[#ef4444] text-3xl font-black pt-6 border-t border-[#E5E7EB] mt-4">
                  <span className="text-xs uppercase tracking-widest text-[#111827]">Total Fare</span>
                  <span>₹{lastTrip!.totalFare.toFixed(2)}</span>
                </div>

                {/* Payment QR Code */}
                <div className="pt-6 flex flex-col items-center border-t border-[#E5E7EB] mt-4">
                  <div className="text-[9px] uppercase tracking-widest text-[#9CA3AF] mb-3">Scan to Pay</div>
                  <div className="bg-white p-2 rounded-xl border border-[#F1F3F5] shadow-sm">
                    <img 
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=upi://pay?pa=smyilsamysmyilsamy436-2@okhdfcbank&pn=TrustyYellowCabs&am=${lastTrip!.totalFare.toFixed(2)}&cu=INR`}
                      alt="Payment QR Code"
                      className="w-32 h-32"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div className="mt-2 text-[8px] font-mono text-[#9CA3AF]">Trustyyellowcabs</div>
                </div>
              </div>

              <p className="text-center text-[#ef4444] text-[9px] font-black mt-8 leading-relaxed uppercase tracking-wider opacity-80">
                ⚠️ உடைமைகளைச் சரிபார்த்துக் கொள்ளவும்.<br/>
                Check belongings before leaving.
              </p>
            </div>

            <div className="w-full space-y-3">
              <button 
                onClick={shareTripDetails}
                className="w-full py-5 rounded-[20px] bg-[#25D366] text-white font-black text-lg uppercase tracking-widest shadow-md active:scale-95 flex items-center justify-center gap-2"
              >
                <div className="w-5 h-5 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.445 0 .01 5.437 0 12.045c0 2.112.552 4.173 1.6 6.005L0 24l6.117-1.605a11.777 11.777 0 005.925 1.585h.005c6.604 0 12.039-5.436 12.044-12.044a11.817 11.817 0 00-3.48-8.512z"/>
                  </svg>
                </div>
                Share Receipt
              </button>
              <button 
                onClick={resetTrip}
                className="w-full py-5 rounded-[20px] bg-[#111827] text-white font-black text-lg uppercase tracking-widest shadow-md active:scale-95"
              >
                New Trip
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Settings Trigger */}
      {status !== 'COMPLETED' && (
        <div className="fixed top-20 right-4 z-50 flex flex-col gap-3 items-end">
          <button 
            onClick={() => setShowSettings(true)}
            className="p-3 bg-white rounded-2xl shadow-sm border border-[#F1F3F5] text-[#9CA3AF] active:scale-95"
          >
            <SettingsIcon className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Modals */}
      <AnimatePresence>
        {showSettings && (
          <motion.div 
            initial={{ opacity: 0, y: '100%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-6"
          >
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="bg-white w-full md:max-w-lg md:rounded-[40px] rounded-t-[40px] p-6 flex flex-col max-h-[90vh]"
            >
              <div className="w-12 h-1.5 bg-[#E5E7EB] rounded-full mx-auto mb-6 shrink-0 md:hidden" />
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-black uppercase tracking-tighter">Fare Settings</h2>
                <button onClick={() => setShowSettings(false)} className="p-2 bg-[#F3F4F6] rounded-full">
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <div className="space-y-6 overflow-y-auto pb-6">
                <div className="bg-[#F9FAFB] p-6 rounded-[28px] border border-[#F1F3F5]">
                  <label className="text-[10px] font-black text-[#9CA3AF] uppercase tracking-[2px] mb-3 block">Driver Name</label>
                  <input 
                    type="text" 
                    placeholder="Enter Name"
                    value={settings.driverName}
                    onChange={(e) => setSettings({...settings, driverName: e.target.value.toUpperCase()})}
                    className="w-full bg-transparent text-3xl font-black outline-none text-[#111827] tracking-tighter uppercase"
                  />
                </div>
                <div className="bg-[#F9FAFB] p-6 rounded-[28px] border border-[#F1F3F5]">
                  <label className="text-[10px] font-black text-[#9CA3AF] uppercase tracking-[2px] mb-3 block">Vehicle Number</label>
                  <input 
                    type="text" 
                    placeholder="TN 00 XX 0000"
                    value={settings.vehicleNumber}
                    onChange={(e) => setSettings({...settings, vehicleNumber: e.target.value.toUpperCase()})}
                    className="w-full bg-transparent text-3xl font-black outline-none text-[#111827] tracking-tighter uppercase"
                  />
                </div>

                
                
              
                <div className="bg-[#F9FAFB] p-6 rounded-[28px] border border-[#F1F3F5]">
                  <label className="text-[10px] font-black text-[#9CA3AF] uppercase tracking-[2px] mb-3 block">Base Fare (₹)</label>
                  <input 
                    type="number" 
                    value={settings.baseFare}
                    onChange={(e) => setSettings({...settings, baseFare: Number(e.target.value)})}
                    className="w-full bg-transparent text-5xl font-black outline-none text-[#111827] tracking-tighter"
                  />
                </div>
                <div className="bg-[#F9FAFB] p-6 rounded-[28px] border border-[#F1F3F5]">
                  <label className="text-[10px] font-black text-[#9CA3AF] uppercase tracking-[2px] mb-3 block">Price per KM (₹)</label>
                  <input 
                    type="number" 
                    value={settings.pricePerKm}
                    onChange={(e) => setSettings({...settings, pricePerKm: Number(e.target.value)})}
                    className="w-full bg-transparent text-5xl font-black outline-none text-[#111827] tracking-tighter"
                  />
                </div>
              </div>

              <button 
                onClick={() => setShowSettings(false)}
                className="mt-auto bg-[#111827] text-white font-black py-6 rounded-[24px] text-xl uppercase tracking-widest shadow-xl active:scale-95"
              >
                SAVE SETTINGS
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
