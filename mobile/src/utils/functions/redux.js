export function getUserData(key){
    const { user } = JSON.parse(localStorage.getItem("session")) ?? JSON.parse(sessionStorage.getItem("session")) ?? {};
    return JSON.parse(localStorage.getItem("users"))?.[user]?.[key];
};

export function setUserData(key, data, loginUser) {
    const users = JSON.parse(localStorage.getItem("users"));
    const { user } = JSON.parse(localStorage.getItem("session")) ?? JSON.parse(sessionStorage.getItem("session")) ?? {};

    localStorage.setItem("users", JSON.stringify({ ...users, [user ?? loginUser]: { ...users[user ?? loginUser], [key]: data }}));
};
