import db from "src/db";

export const useUsersServices = () => {
    const dexie = db.instance;

    const getUser = (id) => {
        return dexie.users.get(id);
    };

    const saveUser = (user) => {
        return dexie.users.put(user);
    };

    const updateUser = (user) => {
        return dexie.users.update(user?.id, user);
    };

    const deleteUser = (id) => {
        return dexie.users.delete(id);
    };

    return {
        getUser,
        saveUser,
        updateUser,
        deleteUser
    }
};