import { useState } from 'react';
import { FaSync, FaTimes } from 'react-icons/fa';
import toast from 'react-hot-toast';

import { APP_VERSION } from 'src/utils';

/**
 * AboutModal - Modal "A propos" avec verification des mises a jour PWA
 *
 * @param {Object} props
 * @param {boolean} props.open - Si la modal est ouverte
 * @param {function} props.onClose - Callback pour fermer la modal
 * @param {string} [props.appName] - Nom de l'application (defaut: "Application")
 */
export const AboutModal = ({ open, onClose, appName = 'Application' }) => {
    const [updateStatus, setUpdateStatus] = useState('idle');
    // 'idle' | 'checking' | 'available' | 'upToDate' | 'updating'

    const checkForUpdates = async () => {
        if (!('serviceWorker' in navigator)) {
            toast.error('Mises a jour non supportees sur ce navigateur');
            return;
        }

        setUpdateStatus('checking');
        try {
            const registration = await navigator.serviceWorker.getRegistration();
            if (!registration) {
                setUpdateStatus('upToDate');
                toast('Application a jour');
                return;
            }

            // Force check for updates
            await registration.update();

            // Check if there's a waiting worker (new version ready)
            if (registration.waiting || registration.installing) {
                setUpdateStatus('available');
            } else {
                setUpdateStatus('upToDate');
                toast('Application a jour');
            }
        } catch (err) {
            console.error('Error checking for updates:', err);
            setUpdateStatus('idle');
            toast.error('Erreur lors de la verification');
        }
    };

    const applyUpdate = () => {
        setUpdateStatus('updating');
        window.location.reload();
    };

    const handleClose = () => {
        setUpdateStatus('idle');
        onClose?.();
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl relative">
                <button
                    onClick={handleClose}
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
                >
                    <FaTimes />
                </button>

                <h3 className="text-lg font-bold text-gray-800 mb-4">A propos</h3>

                <div className="space-y-3 text-gray-600">
                    <div className="flex justify-between">
                        <span>Application</span>
                        <span className="font-medium text-gray-800">{appName}</span>
                    </div>
                    <div className="flex justify-between">
                        <span>Version</span>
                        <span className="font-medium text-gray-800">{APP_VERSION || '-'}</span>
                    </div>
                </div>

                {/* Update section */}
                <div className="mt-4 pt-4 border-t border-gray-200">
                    {updateStatus === 'available' ? (
                        <button
                            onClick={applyUpdate}
                            className="w-full py-2 px-4 bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center justify-center gap-2"
                        >
                            <FaSync />
                            Installer la mise a jour
                        </button>
                    ) : (
                        <button
                            onClick={checkForUpdates}
                            disabled={updateStatus === 'checking' || updateStatus === 'updating'}
                            className="w-full py-2 px-4 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            <FaSync className={updateStatus === 'checking' ? 'animate-spin' : ''} />
                            {updateStatus === 'checking' ? 'Verification...' :
                             updateStatus === 'upToDate' ? 'Application a jour' :
                             updateStatus === 'updating' ? 'Mise a jour...' :
                             'Verifier les mises a jour'}
                        </button>
                    )}
                </div>

                <button
                    onClick={handleClose}
                    className="w-full mt-4 py-2 px-4 bg-primary text-white rounded-lg hover:bg-primary/90"
                >
                    Fermer
                </button>
            </div>
        </div>
    );
};
