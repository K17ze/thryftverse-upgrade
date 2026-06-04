import os
import re

screens_dir = 'C:/Users/ASUS/Desktop/thryftverse/frontend/src/screens'
os.chdir(screens_dir)

def fix_file(filename, replacements):
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()
    for old, new in replacements:
        if old in content:
            content = content.replace(old, new)
    with open(filename, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f'Fixed {filename}')

# Fix BrowseScreen.tsx - seller type issues
fix_file('BrowseScreen.tsx', [
    ('const seller = null;', 'const seller: any = null;'),
])

# Fix CategoryDetailScreen.tsx
fix_file('CategoryDetailScreen.tsx', [
    ('import { MOCK_CATEGORIES } from \'../data/mockData\';\n', 'import { MOCK_CATEGORIES, User } from \'../data/mockData\';\n'),
    ('const seller = null;', 'const seller: User | null = null;'),
])

# Fix CheckoutScreen.tsx
fix_file('CheckoutScreen.tsx', [
    ('import { MOCK_LISTINGS } from \'../data/mockData\';\nimport { useStore } from \'../store/useStore\';',
     'import { MOCK_LISTINGS, User } from \'../data/mockData\';\nimport { useStore } from \'../store/useStore\';'),
    ('const seller = null;', 'const seller: User | null = null;'),
    # Remove remaining mockFind if any
    ('import { mockFind } from \'../utils/mockGate\';\n', ''),
])

# Fix InboxScreen.tsx
fix_file('InboxScreen.tsx', [
    ('const seller = null;', 'const seller: any = null;'),
])

# Fix ItemDetailScreen.tsx
fix_file('ItemDetailScreen.tsx', [
    ('import { MOCK_LISTINGS, Listing, User } from \'../data/mockData\';',
     'import { MOCK_LISTINGS, Listing, User } from \'../data/mockData\';\nimport { mockFind } from \'../utils/mockGate\';'),
    ('const seller = null;', 'const seller: User | null = null;'),
])

# Fix MakeOfferScreen.tsx
fix_file('MakeOfferScreen.tsx', [
    ('import { MOCK_LISTINGS } from \'../data/mockData\';',
     'import { MOCK_LISTINGS, User } from \'../data/mockData\';\nimport { mockFind } from \'../utils/mockGate\';'),
    ('const seller = null;', 'const seller: User | null = null;'),
])

# Fix MyOrdersScreen.tsx
fix_file('MyOrdersScreen.tsx', [
    ('import { MOCK_LISTINGS, Listing, User } from \'../data/mockData\';',
     'import { MOCK_LISTINGS, MOCK_USERS, Listing, User } from \'../data/mockData\';'),
    ('buyer: null,', 'buyer: undefined,'),
    ('const seller = null;', 'const seller: User | null = null;'),
])

# Fix NotificationsScreen.tsx
fix_file('NotificationsScreen.tsx', [
    ('const actorUser = null;', 'const actorUser: any = null;'),
])

# Fix OrderDetailScreen.tsx
fix_file('OrderDetailScreen.tsx', [
    ('import { MOCK_LISTINGS } from \'../data/mockData\';',
     'import { MOCK_LISTINGS, MOCK_USERS } from \'../data/mockData\';\nimport { mockFind, mockArrayOrEmpty } from \'../utils/mockGate\';'),
    ('null ??', 'null ??'),
])

# Fix UserProfileScreen.tsx
fix_file('UserProfileScreen.tsx', [
    ('import { Listing, MY_USER } from \'../data/mockData\';',
     'import { Listing, MY_USER, User } from \'../data/mockData\';'),
    (': null,', ': null as User | null,'),
])

print('Done fixing TypeScript errors')
