export interface Notification {
  id: string;
  itemImage: string;
  text: string;
  time: string;
  type: 'new_item' | 'favourite' | 'system';
}
