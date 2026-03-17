import { useState, useEffect, useRef } from 'react';
import { Location } from '../types';
import { calculateDistance } from '../utils';

export function useGeolocation(isActive: boolean, initialDistance: number = 0) {
  const [currentLocation, setCurrentLocation] = useState<Location | null>(null);
  const [distance, setDistance] = useState(initialDistance);
  const [route, setRoute] = useState<Location[]>([]);
  const [speed, setSpeed] = useState(0);
  const lastLocationRef = useRef<Location | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('last_known_location');
    if (saved && !lastLocationRef.current) {
      lastLocationRef.current = JSON.parse(saved);
    }
  }, []);

  useEffect(() => {
    if (currentLocation) {
      localStorage.setItem('last_known_location', JSON.stringify(currentLocation));
    }
  }, [currentLocation]);

  useEffect(() => {
    if (initialDistance > 0 && distance === 0) {
      setDistance(initialDistance);
    }
  }, [initialDistance]);

  useEffect(() => {
    if (!isActive) {
        lastLocationRef.current = null;
        setSpeed(0);
        return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy, speed: currentSpeed } = position.coords;
        
        // 1. Accuracy Filter: Ignore points with poor accuracy (> 20m)
        if (accuracy > 20) return;

        const newLocation: Location = {
          lat: latitude,
          lng: longitude,
          timestamp: position.timestamp,
        };

        // Update current location immediately for the map/UI
        setCurrentLocation(newLocation);
        setRoute((prev) => [...prev, newLocation]);
        setSpeed(currentSpeed || 0);

        if (lastLocationRef.current) {
          const d = calculateDistance(
            lastLocationRef.current.lat,
            lastLocationRef.current.lng,
            newLocation.lat,
            newLocation.lng
          );
          
          // 2. Jitter Filter: Ignore very small movements (less than 3 meters)
          // 3. Dynamic Speed Filter: Ignore impossible jumps based on time elapsed
          const timeDiffSeconds = (newLocation.timestamp - lastLocationRef.current.timestamp) / 1000;
          
          // If time diff is too small (< 1s), skip to avoid noise
          if (timeDiffSeconds < 1) return;

          const speedKmh = d / (timeDiffSeconds / 3600);
          
          // Max reasonable speed for a taxi (e.g. 140 km/h)
          const MAX_SPEED_KMH = 140;
          
          // If we have a large gap (e.g. screen was off), we allow a larger distance jump
          // but still bound it by a reasonable max speed.
          const isReasonableMovement = d > 0.003 && speedKmh < MAX_SPEED_KMH;

          if (isReasonableMovement) {
            setDistance((prev) => prev + d);
            lastLocationRef.current = newLocation;
          }
        } else {
          lastLocationRef.current = newLocation;
        }
      },
      (error) => console.error('Geolocation error:', error),
      { 
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 5000
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [isActive]);

  const resetDistance = () => {
    setDistance(0);
    setRoute([]);
    setSpeed(0);
    lastLocationRef.current = null;
  };

  return { currentLocation, distance, speed, route, resetDistance };
}
