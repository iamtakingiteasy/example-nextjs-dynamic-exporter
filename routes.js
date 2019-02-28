const routes = require('next-routes');

const root = [
    {
        name: 'index',
        patern: '/',
        page: '/',
    },
    {
        name: 'property-list', 
        pattern: '/property', 
        page: '/property',
        groups: ['property'],
    },
    {
        name: 'property-id', 
        pattern: '/property/:id', 
        page: '/property',
        groups: ['property'],
    },
    {
        name: 'user-list', 
        pattern: '/user', 
        page: '/user',
        groups: ['user'],
    },
    {
        name: 'user-id', 
        pattern: '/user/:id', 
        page: '/user',
        groups: ['user'],
    },
];

module.exports = root.reduce((acc, r) => {
    acc.add(r);
    acc.routes.find(p => p.name === r.name).groups = r.groups;
    return acc;
}, routes());
